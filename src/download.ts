/**
 * The PDF download fallback chain (DESIGN §9): ten levels from the OA link a
 * source already surfaced down to the optional gray-area mirrors. Every level
 * either yields a verified PDF (%PDF magic, http(s) URL after redirects) or
 * degrades to "try the next level" — 401/403/429/timeouts never break the chain.
 * @module dsh-scholar-search/download
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { isHttpUrl, normalizeArxivId, normalizeDoi, requestSignal } from './http.js'
import type { FetchOptions } from './http.js'
import type { PaperMeta } from './types.js'
import type { SourceRegistry } from './sources/index.js'

/** Browser-like headers publisher CDNs accept for PDF downloads. */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/pdf,application/x-pdf,*/*',
}

/** `%PDF` magic. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

/** Candidate PDF URLs derived from an OA publisher landing page (dsh-ai4scholar pattern table). */
export function pdfCandidatesFor(landingUrl: string): string[] {
  const candidates: string[] = []
  let u: URL
  try {
    u = new URL(landingUrl)
  } catch {
    return candidates
  }
  const host = u.hostname
  const path = u.pathname
  if (host.includes('journals.plos.org')) {
    const id = u.searchParams.get('id')
    if (id !== null) candidates.push(`${u.origin}${path.replace(/\/article$/, '/article/file')}?id=${encodeURIComponent(id)}&type=printable`)
  }
  if (host.includes('frontiersin.org') && /\/articles\/10\./.test(path)) candidates.push(`${u.origin}${path.replace(/\/full$/, '')}/pdf`)
  if (host.includes('mdpi.com')) {
    if (path.endsWith('/htm')) candidates.push(`${u.origin}${path.replace(/\/htm$/, '/pdf')}`)
    else if (!path.endsWith('.pdf')) candidates.push(`${u.origin}${path.replace(/\/$/, '')}/pdf`)
  }
  if ((host.includes('biorxiv.org') || host.includes('medrxiv.org')) && path.startsWith('/content/')) {
    candidates.push(`${u.origin}${path.replace(/(\.full)?(\.pdf)?$/, '')}.full.pdf`)
  }
  if (host.includes('arxiv.org') && path.startsWith('/abs/')) candidates.push(`https://arxiv.org/pdf/${path.slice('/abs/'.length)}`)
  if (host.includes('nature.com')) {
    const m = /\/articles\/(10\.\d+\/[^\s?#]+)/.exec(path)
    if (m !== null) candidates.push(`${u.origin}/content/pdf/${m[1]}.pdf`)
  }
  return [...new Set(candidates)]
}

/** Filesystem-safe filename: `{safeTitle}_{year}_{sourceId}.pdf`. */
export function safeFilename(paper: PaperMeta, override?: string | undefined): string {
  if (override !== undefined && override.trim().length > 0) {
    const clean = override.trim().replace(/[^A-Za-z0-9._-]+/g, '_')
    return clean.endsWith('.pdf') ? clean : `${clean}.pdf`
  }
  const slug = paper.title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'paper'
  const year = paper.year !== undefined ? `_${paper.year}` : ''
  const id = paper.sourceId.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60)
  return `${slug}${year}_${id}.pdf`
}

/** A verified PDF download, before it is written to disk. */
export interface PdfFetch {
  data: Uint8Array
  finalUrl: string
}

/** Whether this URL is a Europe PMC official endpoint, which 403s intermittently and benefits from a retry. */
function isEuropePmcUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'europepmc.org' || host.endsWith('.europepmc.org')
  } catch {
    return false
  }
}

/** Sleep, respecting caller cancellation. */
function sleep(ms: number, signal?: AbortSignal | undefined): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => { cleanup(); resolvePromise() }, ms)
    const onAbort = () => { clearTimeout(timer); cleanup(); const e = new Error('aborted'); e.name = 'AbortError'; reject(e) }
    const cleanup = () => { signal?.removeEventListener('abort', onAbort) }
    if (signal?.aborted === true) { onAbort(); return }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Why a fetch attempt failed, for diagnostics. */
export interface FetchFailure {
  /** HTTP status (403/404/...), 'timeout', 'dns', 'abort', 'not-pdf', 'non-http', or 'network'. */
  reason: string
  /** HTTP status code when the failure is an HTTP response. */
  status?: number
}

/** A fetched PDF, or the reason no PDF came back. */
export interface PdfFetchResult {
  fetch?: PdfFetch
  failure?: FetchFailure
}

/** Classify a fetch error into a diagnostic reason. */
function classifyError(error: unknown): FetchFailure {
  const msg = error instanceof Error ? error.message : String(error)
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) return { reason: 'dns' }
  if (/timeout|ETIMEDOUT|aborted due to timeout/i.test(msg)) return { reason: 'timeout' }
  if (/CERT|SSL|TLS|certificate/i.test(msg)) return { reason: 'network' }
  return { reason: 'network' }
}

/**
 * Fetch one URL and verify it actually serves a PDF. Europe PMC's official
 * endpoint 403s intermittently and is retried up to 3 times with a 2s gap.
 * @param url - candidate PDF URL.
 * @param options - timeout and cancellation.
 * @returns the bytes and final URL, or the failure reason.
 */
export async function fetchPdfBytesDetailed(url: string, options: { timeoutMs: number; signal?: AbortSignal | undefined }): Promise<PdfFetchResult> {
  if (!isHttpUrl(url)) return { failure: { reason: 'non-http' } }
  const maxAttempts = isEuropePmcUrl(url) ? 3 : 1
  let lastFailure: FetchFailure = { reason: 'network' }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(2000, options.signal)
    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        redirect: 'follow',
        signal: requestSignal(options.signal, options.timeoutMs),
      })
      if (!res.ok) {
        lastFailure = { reason: `http-${res.status}`, status: res.status }
        continue
      }
      const finalUrl = res.url.length > 0 ? res.url : url
      if (!isHttpUrl(finalUrl)) return { failure: { reason: 'non-http' } }
      const data = new Uint8Array(await res.arrayBuffer())
      if (!looksLikePdf(data)) return { failure: { reason: 'not-pdf' } }
      return { fetch: { data, finalUrl } }
    } catch (error) {
      if (options.signal?.aborted === true && error instanceof Error && error.name === 'AbortError') throw error
      lastFailure = classifyError(error)
      continue
    }
  }
  return { failure: lastFailure }
}

/**
 * Fetch one URL and verify it actually serves a PDF. Returns `undefined` on
 * any HTTP/transport failure, non-http(s) redirect target, or non-PDF body.
 * Europe PMC's official PDF endpoint 403s intermittently — it is retried up to
 * 3 times with a 2s gap (per the field report's findings).
 * @param url - candidate PDF URL.
 * @param options - timeout and cancellation.
 * @returns the bytes and final URL, or `undefined`.
 */
export async function fetchPdfBytes(url: string, options: { timeoutMs: number; signal?: AbortSignal | undefined }): Promise<PdfFetch | undefined> {
  const result = await fetchPdfBytesDetailed(url, options)
  return result.fetch
}

/** Successful download result. */
export interface DownloadSuccess {
  path: string
  source: string
  url: string
  sizeBytes: number
}

/** Failed download result: no free full text anywhere in the chain. */
export interface DownloadFailure {
  error: 'no-free-fulltext'
  triedSources: string[]
  /** One `level:host` entry per candidate URL that was fetched but rejected. */
  failures?: string[]
}

export type DownloadResult = DownloadSuccess | DownloadFailure

/** One fallback level: a source label plus the URLs it wants to try. */
interface Level {
  label: string
  urls: string[]
}

/**
 * Build the ordered fallback chain for one paper (DESIGN §9):
 * 1. known OA PDF (`openAccessPdfUrl` from the search sources — OpenAlex,
 *    Semantic Scholar, Europe PMC, CORE, DOAJ all fill this field),
 * 2. Unpaywall, 3. Semantic Scholar, 4. Europe PMC (both re-resolved live),
 * 5. arXiv / bioRxiv direct patterns, 6. OpenAIRE, 7. CORE,
 * 8. crossref_page landing meta, 9. publisher OA URL patterns,
 * 10. gray-area mirrors (only when enabled).
 * @param paper - the paper to resolve.
 * @param registry - the source registry.
 * @param signal - cancellation.
 * @returns the ordered levels that produced at least one candidate URL.
 */
/** The chain plus every level that was attempted (even those with no candidate). */
export interface FallbackChain {
  levels: Level[]
  /** Labels of every level consulted, in order — for diagnostics when levels is empty. */
  attempted: string[]
}

export async function buildFallbackChain(paper: PaperMeta, registry: SourceRegistry, signal: AbortSignal): Promise<FallbackChain> {
  const levels: Level[] = []
  const attempted: string[] = []
  const seen = new Set<string>()
  const push = (label: string, urls: (string | undefined)[]): void => {
    attempted.push(label)
    const fresh = urls.filter((u): u is string => u !== undefined && isHttpUrl(u) && !seen.has(u))
    for (const u of fresh) seen.add(u)
    if (fresh.length > 0) levels.push({ label, urls: fresh })
  }

  // 0. Enrich a bare identifier (DOI/PMID/arxivId with no OA URL yet) by a live
  //    lookup, so the levels below have real candidates instead of an empty
  //    chain. OpenAlex first (widest coverage, free), then Europe PMC for
  //    biomedical DOIs, then Unpaywall. Mutates nothing — works on a copy.
  let working = paper
  if (paper.openAccessPdfUrl === undefined) {
    const openalex = registry.searchSources.find((s) => s.id === 'openalex')
    const enriched = await openalex?.resolvePdf?.(working, signal)
    if (enriched !== undefined) {
      attempted.push('enrich:openalex')
      working = { ...paper, openAccessPdfUrl: enriched, isOpenAccess: true }
    }
  }

  // 1. Europe PMC first whenever the paper has a PMCID: its official getPdf
  //    endpoint is the single highest-yield channel for biomedical OA papers
  //    (field report: ~90% success, no anti-bot). resolvePdf also reverse-looks
  //    up a DOI/PMID to a PMCID, so this covers identifier-only calls too.
  const epmc = registry.searchSources.find((s) => s.id === 'europe_pmc')
  push('europe_pmc', [await epmc?.resolvePdf?.(working, signal)])
  // 2. The OA link search already surfaced (or enrich:openalex just found).
  push('direct', [working.openAccessPdfUrl])
  // 3. Unpaywall — institutional-repository copies (KCL Pure, SDU, Bristol...),
  //    the key alternative when the publisher site is bot-blocked.
  push('unpaywall', [await registry.linkSources.unpaywall.resolvePdf?.(working, signal)])
  // 4. Semantic Scholar's cached OA PDFs (older papers, dead publisher sites).
  const s2 = registry.searchSources.find((s) => s.id === 'semantic_scholar')
  push('semantic_scholar', [await s2?.resolvePdf?.(working, signal)])
  // 5. arXiv / bioRxiv direct patterns from known identifiers.
  const direct: string[] = []
  const arxivId = normalizeArxivId(working.arxivId)
  if (arxivId !== undefined) direct.push(`https://arxiv.org/pdf/${arxivId}`)
  const doi = normalizeDoi(working.doi)
  if (doi !== undefined && /^10\.(1101|64898)\//.test(doi)) {
    const rxiv = registry.searchSources.find((s) => s.id === 'biorxiv')
    const resolved = await rxiv?.resolvePdf?.(working, signal)
    if (resolved !== undefined) direct.push(resolved)
  }
  if (doi !== undefined && /^10\.48550\/arxiv\./i.test(doi)) {
    direct.push(`https://arxiv.org/pdf/${doi.replace(/^10\.48550\/arxiv\./i, '')}`)
  }
  push('preprint', direct)
  // 6. OpenAIRE.
  push('openaire', [await registry.linkSources.openaire.resolvePdf?.(working, signal)])
  // 7. CORE.
  const core = registry.searchSources.find((s) => s.id === 'core')
  push('core', [await core?.resolvePdf?.(working, signal)])
  // 8. crossref_page landing meta.
  push('crossref_page', [await registry.linkSources.crossref_page.resolvePdf?.(working, signal)])
  // 9. Publisher OA URL patterns from the landing page.
  if (working.landingPageUrl !== undefined) push('publisher_patterns', pdfCandidatesFor(working.landingPageUrl))
  // 10. Gray-area mirrors (only when enabled).
  push('grayarea', [await registry.linkSources.grayarea.resolvePdf?.(working, signal)])
  return { levels, attempted }
}

/**
 * Resolve and download a paper's free PDF to `downloadDir`.
 * @param paper - the paper to download.
 * @param options - registry, directories, timeouts.
 * @param signal - cancellation.
 * @returns the saved file, or `{ error: 'no-free-fulltext', triedSources }`.
 */
export async function downloadPaper(
  paper: PaperMeta,
  options: {
    registry: SourceRegistry
    /** Download directory (already resolved against the workspace). */
    downloadDir: string
    fetchOptions: () => FetchOptions
    /** Per-download timeout in milliseconds. */
    pdfTimeoutMs: number
    filename?: string | undefined
    /** Optional browser downloader: retries failed direct fetches through a real page. */
    browser?: { fetchPdf(url: string, opts: { downloadDir: string; timeoutMs: number; signal?: AbortSignal | undefined }): Promise<{ data: Uint8Array; finalUrl: string } | undefined> } | undefined
  },
  signal: AbortSignal,
): Promise<DownloadResult> {
  const chain = await buildFallbackChain(paper, options.registry, signal)
  // Diagnostics: report every level consulted, not just those that produced a
  // candidate URL, so an all-empty chain still shows what was tried.
  const triedSources: string[] = [...chain.attempted]
  const failures: string[] = []
  for (const level of chain.levels) {
    for (const url of level.urls) {
      signal.throwIfAborted()
      const host = new URL(url).hostname
      const detailed = await fetchPdfBytesDetailed(url, { timeoutMs: options.pdfTimeoutMs, signal })
      let fetched = detailed.fetch
      let failureReason = detailed.failure?.reason ?? 'network'
      // Browser retry: a direct fetch that failed on a bot-blocked publisher is
      // retried once through a real browser page (download event or inline body).
      if (fetched === undefined && options.browser !== undefined) {
        const viaBrowser = await options.browser.fetchPdf(url, { downloadDir: options.downloadDir, timeoutMs: options.pdfTimeoutMs, signal })
        if (viaBrowser !== undefined) {
          fetched = viaBrowser
          failureReason = ''
        }
      }
      if (fetched === undefined) {
        failures.push(failureReason.length > 0 ? `${level.label}:${host}(${failureReason})` : `${level.label}:${host}`)
        continue
      }
      await mkdir(options.downloadDir, { recursive: true })
      const filename = safeFilename(paper, options.filename)
      const path = join(options.downloadDir, filename)
      await writeFile(path, fetched.data)
      return { path: resolve(path), source: level.label, url: fetched.finalUrl, sizeBytes: fetched.data.length }
    }
  }
  return { error: 'no-free-fulltext', triedSources, ...(failures.length > 0 ? { failures } : {}) }
}
