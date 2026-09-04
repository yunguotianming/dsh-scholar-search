/**
 * grayarea — Sci-Hub mirrors as the LAST download fallback, enabled only when
 * the user explicitly sets `allowGrayArea: true`. Mirrors are configurable
 * (`grayAreaMirrors`), URL templates carry a `{doi}` placeholder. The legal
 * risk is the user's; see README.
 * @module dsh-scholar-search/sources/grayarea
 */

import { fetchText, isHttpUrl, normalizeDoi, requestSignal } from '../http.js'
import type { FetchOptions } from '../http.js'
import type { PaperMeta, ScholarSource } from '../types.js'

/**
 * Default mirror templates; `grayAreaMirrors` config replaces the whole list.
 * Updated for 2024-2025 active mirrors.
 */
export const DEFAULT_GRAYAREA_MIRRORS = [
  'https://sci-hub.se/{doi}',
  'https://sci-hub.st/{doi}',
  'https://sci-hub.ru/{doi}',
  'https://sci-hub.wf/{doi}',
  'https://sci-hub.ee/{doi}',
  'https://sci-hub.shop/{doi}',
  'https://sci-hub.hkvisa.net/{doi}',
  'https://sci-hub.mksa.top/{doi}',
]

/** A mirror probe result for diagnostics. */
export interface MirrorProbe {
  /** The mirror template host. */
  host: string
  /** Whether the mirror page loaded and contained a PDF link. */
  ok: boolean
  /** HTTP status or error kind. */
  status: string
  /** Resolved PDF URL when found. */
  pdfUrl?: string
  /** Latency in milliseconds. */
  latencyMs: number
}

/** Extract a direct PDF link out of a Sci-Hub-style HTML page. Exported for tests. */
export function pdfUrlFromGrayAreaHtml(html: string, baseUrl: string): string | undefined {
  // <embed src="...pdf...">, <iframe src="...">, or the download button's onclick location.
  const patterns = [
    /<(?:embed|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i,
    /location\.href\s*=\s*['"]([^'"]+)['"]/i,
    /<a\b[^>]*href\s*=\s*["']([^"']*\.pdf[^"']*)["']/i,
  ]
  for (const pattern of patterns) {
    const m = pattern.exec(html)
    const raw = m?.[1]
    if (raw === undefined) continue
    try {
      const resolved = new URL(raw, baseUrl).toString()
      if (isHttpUrl(resolved)) return resolved
    } catch {
      continue
    }
  }
  return undefined
}

/** Whether a URL looks like a Sci-Hub mirror host. */
function isSciHubHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return /sci-hub|sci_hub|scihub/.test(host)
  } catch {
    return false
  }
}

/**
 * Probe one mirror for a DOI and return the result with diagnostics.
 * @param template - mirror URL template with `{doi}`.
 * @param doi - normalized DOI.
 * @param opts - fetch options.
 * @returns the probe result.
 */
async function probeMirror(template: string, doi: string, opts: FetchOptions): Promise<MirrorProbe> {
  const started = Date.now()
  const pageUrl = template.replace('{doi}', encodeURIComponent(doi))
  let host = 'unknown'
  try {
    host = new URL(pageUrl).hostname
  } catch {
    return { host, ok: false, status: 'bad-url', latencyMs: 0 }
  }
  if (!isHttpUrl(pageUrl)) return { host, ok: false, status: 'non-http', latencyMs: 0 }
  const result = await fetchText(pageUrl, { ...opts, timeoutMs: Math.min(opts.timeoutMs, 15_000) })
  const latencyMs = Date.now() - started
  if (result === undefined) return { host, ok: false, status: 'unreachable', latencyMs }
  const pdfUrl = pdfUrlFromGrayAreaHtml(result.body, result.finalUrl)
  if (pdfUrl !== undefined) return { host, ok: true, status: 'found', pdfUrl, latencyMs }
  return { host, ok: false, status: 'no-pdf-link', latencyMs }
}

/**
 * Create the gray-area fallback source.
 * @param options - shared fetch options source.
 * @param enabled - whether `allowGrayArea` is on, read per call.
 * @param mirrors - mirror URL templates, read per call.
 * @returns the source.
 */
export function grayareaSource(
  options: () => FetchOptions,
  enabled: () => boolean,
  mirrors: () => string[],
): ScholarSource {
  return {
    id: 'grayarea',
    async search(): Promise<PaperMeta[]> {
      return []
    },
    async resolvePdf(paper: PaperMeta, signal: AbortSignal): Promise<string | undefined> {
      if (!enabled()) return undefined
      const doi = normalizeDoi(paper.doi)
      if (doi === undefined) return undefined
      const opts = options()
      // Try mirrors in order; stop at the first one that yields a PDF link.
      for (const template of mirrors()) {
        if (signal.aborted) return undefined
        const probe = await probeMirror(template, doi, { ...opts, signal })
        if (probe.ok && probe.pdfUrl !== undefined) return probe.pdfUrl
      }
      return undefined
    },
  }
}

/**
 * Direct Sci-Hub download: probe all mirrors concurrently and return the
 * first PDF link found. Unlike `grayareaSource.resolvePdf`, this is not
 * throttled and does not require `allowGrayArea` — the caller is expected to
 * have checked that.
 * @param doi - normalized DOI.
 * @param mirrors - mirror URL templates.
 * @param opts - fetch options.
 * @returns the first PDF URL found, plus per-mirror diagnostics.
 */
export async function scihubResolvePdf(
  doi: string,
  mirrors: string[],
  opts: FetchOptions,
): Promise<{ pdfUrl: string | undefined; probes: MirrorProbe[] }> {
  const probes: MirrorProbe[] = []
  // Probe mirrors concurrently with a cap of 3 at a time to avoid hammering.
  const concurrency = 3
  let firstPdf: string | undefined
  for (let i = 0; i < mirrors.length; i += concurrency) {
    const batch = mirrors.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map((t) => probeMirror(t, doi, opts)))
    probes.push(...batchResults)
    for (const p of batchResults) {
      if (p.ok && p.pdfUrl !== undefined && firstPdf === undefined) {
        firstPdf = p.pdfUrl
      }
    }
    if (firstPdf !== undefined) break
  }
  return { pdfUrl: firstPdf, probes }
}

/**
 * Ping a single mirror to check if it is reachable (for the settings card).
 * @param template - mirror URL template with `{doi}`.
 * @param opts - fetch options.
 * @returns reachability and latency.
 */
export async function scihubPingMirror(template: string, opts: FetchOptions): Promise<{ host: string; ok: boolean; latencyMs?: number; error?: string }> {
  const started = Date.now()
  const pageUrl = template.replace('{doi}', '10.1038/nature12373')
  let host = 'unknown'
  try { host = new URL(pageUrl).hostname } catch { /* ignore */ }
  if (!isHttpUrl(pageUrl)) return { host, ok: false, error: 'bad-url' }
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'dsh-scholar-search/0.0.1' },
      redirect: 'follow',
      signal: requestSignal(opts.signal, Math.min(opts.timeoutMs, 10_000)),
    })
    const latencyMs = Date.now() - started
    return res.ok ? { host, ok: true, latencyMs } : { host, ok: false, error: `HTTP ${res.status}` }
  } catch (error) {
    return { host, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
