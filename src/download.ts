/**
 * PDF 下载回退链（DESIGN §8）：优先尝试 OA 来源，最后尝试默认可用的灰色渠道。
 * 每一级校验 PDF 文件头和重定向后的 http(s) URL，失败时继续下一级。
 * @module dsh-scholar-search/download
 */

import { mkdir, open, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { isHttpUrl, normalizeArxivId, normalizeDoi, requestSignal } from './http.js'
import type { FetchOptions } from './http.js'
import type { PaperMeta, PdfLocations } from './types.js'
import type { SourceRegistry } from './sources/index.js'
import { mergePapers, normalizeTitle } from './paper.js'
import { verifyPdfContent } from './pdf.js'
import type { PdfVerification } from './pdf.js'
import { pdfLinksFromLandingPage } from './sources/crossref_page.js'

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
    let clean = override.trim().normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/[. ]+$/g, '')
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)) clean = `_${clean}`
    clean = Array.from(clean.replace(/\.pdf$/i, '')).slice(0, 180).join('') || 'paper'
    return `${clean}.pdf`
  }
  const slug = paper.title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'paper'
  const year = paper.year !== undefined ? `_${paper.year}` : ''
  const id = paper.sourceId.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60)
  return safeFilename(paper, `${slug}${year}_${id}.pdf`)
}

/** 下载前实际试写目标目录；不修改 ACL 或任何默认目录配置。 */
export async function prepareDownloadDir(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  const probe = join(directory, `.scholar-write-${randomUUID()}.tmp`)
  const handle = await open(probe, 'wx')
  try { await handle.writeFile('write-check') } finally {
    try { await handle.close() } finally { await unlink(probe) }
  }
}

export async function savePdf(path: string, bytes: Uint8Array): Promise<void> {
  if (!looksLikePdf(bytes)) throw new Error('响应内容不是 PDF')
  await saveFileExclusive(path, bytes)
}

/** 独占写入，失败时清理本次创建的文件。 */
export async function saveFileExclusive(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(path, 'wx')
  try {
    try { await handle.writeFile(bytes) } finally { await handle.close() }
  } catch (error) {
    await unlink(path).catch(() => {})
    throw error
  }
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
  landing?: { url: string; links: string[] }
}

/** Classify a fetch error into a diagnostic reason. */
function classifyError(error: unknown): FetchFailure {
  const cause = error instanceof Error ? error.cause : undefined
  const msg = `${error instanceof Error ? error.message : String(error)} ${cause instanceof Error ? cause.message : ''}`
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
export async function fetchPdfBytesDetailed(url: string, options: { timeoutMs: number; signal?: AbortSignal | undefined; parseLanding?: boolean }): Promise<PdfFetchResult> {
  if (!isHttpUrl(url)) return { failure: { reason: 'non-http' } }
  const maxAttempts = isEuropePmcUrl(url) ? 3 : 1
  let lastFailure: FetchFailure = { reason: 'network' }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    options.signal?.throwIfAborted()
    if (attempt > 0) await sleep(2000, options.signal)
    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        redirect: 'follow',
        signal: requestSignal(options.signal, options.timeoutMs),
      })
      if (!res.ok) {
        lastFailure = { reason: `http-${res.status}`, status: res.status }
        const body = await res.text()
        if (/cf-chl-|Just a moment|challenge-platform|captcha/i.test(body)) return { failure: { reason: 'challenge', status: res.status } }
        if (![403, 429].includes(res.status) && res.status < 500) return { failure: lastFailure }
        continue
      }
      const finalUrl = res.url.length > 0 ? res.url : url
      if (!isHttpUrl(finalUrl)) return { failure: { reason: 'non-http' } }
      const data = new Uint8Array(await res.arrayBuffer())
      if (!looksLikePdf(data)) {
        const decoder = new TextDecoder()
        const prefix = decoder.decode(data.subarray(0, 8192))
        if (/cf-chl-|Just a moment|challenge-platform|captcha/i.test(prefix)) return { failure: { reason: 'challenge' } }
        const html = /\btext\/html\b/i.test(res.headers.get('content-type') ?? '') || /<(?:!doctype\s+html|html|head|body|a|meta)\b/i.test(prefix)
        if (options.parseLanding === true && html) {
          const links = pdfLinksFromLandingPage(decoder.decode(data.subarray(0, 512 * 1024)), finalUrl)
          return { failure: { reason: 'not-pdf' }, landing: { url: finalUrl, links } }
        }
        return { failure: { reason: 'not-pdf' } }
      }
      return { fetch: { data, finalUrl } }
    } catch (error) {
      options.signal?.throwIfAborted()
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
  /** 包含成功之前各候选的失败原因，便于批量汇总。 */
  attempts?: DownloadAttempt[]
  metadata?: PaperMeta
  pdfVerification?: Exclude<PdfVerification, 'content-mismatch'>
}

export interface DownloadAttempt {
  source: string
  url?: string
  reason: string
  status?: number
}

/** Failed download result: no free full text anywhere in the chain. */
export interface DownloadFailure {
  error: 'no-free-fulltext' | 'write-error' | 'file-exists' | 'timeout' | 'not-attempted' | 'metadata-mismatch' | 'metadata-unverified' | 'content-mismatch'
  triedSources: string[]
  failureKind?: 'no-candidate' | 'candidates-failed' | 'lookup-failed'
  message?: string
  attempts?: DownloadAttempt[]
  metadata?: PaperMeta
  /** 公开落地页和全文候选，供研究者接手。 */
  manualLinks?: string[]
  /** One `level:host` entry per candidate URL that was fetched but rejected. */
  failures?: string[]
}

export type DownloadResult = DownloadSuccess | DownloadFailure

/** One fallback level: a source label plus the URLs it wants to try. */
interface Level {
  label: string
  urls: string[]
  landingUrls?: string[]
}

/**
 * Build the ordered fallback chain for one paper (DESIGN §9):
 * 1. known OA PDF (`openAccessPdfUrl` from the search sources — OpenAlex,
 *    Semantic Scholar, Europe PMC, CORE, DOAJ all fill this field),
 * 2. Unpaywall, 3. Semantic Scholar, 4. Europe PMC (both re-resolved live),
 * 5. arXiv / bioRxiv direct patterns, 6. OpenAIRE, 7. CORE,
 * 8. crossref_page landing meta, 9. publisher OA URL patterns,
 * 10. 灰色渠道镜像（默认可用，最后兜底）。
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

async function* fallbackLevels(paper: PaperMeta, registry: SourceRegistry, signal: AbortSignal, attempted: string[], failures: DownloadAttempt[], openAccessOnly = false): AsyncGenerator<Level> {
  const seen = new Set<string>()
  const level = (label: string, urls: (string | undefined)[], landings: string[] = []): Level => {
    attempted.push(label)
    const fresh = (candidates: (string | undefined)[]): string[] => candidates.filter((url): url is string => {
      if (url === undefined || !isHttpUrl(url) || seen.has(url)) return false
      seen.add(url)
      return true
    })
    const pdfUrls = fresh(urls)
    const landingUrls = fresh(landings)
    return { label, urls: pdfUrls, ...(landingUrls.length > 0 ? { landingUrls } : {}) }
  }
  const lookup = async (id: string): Promise<PdfLocations> => {
    signal.throwIfAborted()
    const source = registry.searchSources.find((s) => s.id === id) ?? registry.linkSources[id as keyof SourceRegistry['linkSources']]
    try {
      if (source?.resolvePdfLocations !== undefined) return await source.resolvePdfLocations(paper, signal)
      const url = await source?.resolvePdf?.(paper, signal)
      return { pdfUrls: url === undefined ? [] : [url], landingUrls: [] }
    } catch {
      signal.throwIfAborted()
      failures.push({ source: id, reason: 'lookup-failed' })
      return { pdfUrls: [], landingUrls: [] }
    }
  }
  const sourceLevel = async (id: string): Promise<Level> => {
    const { pdfUrls, landingUrls } = await lookup(id)
    return level(id, pdfUrls, landingUrls)
  }
  // 按需查找并立刻下载；命中后不再请求后续来源。
  yield await sourceLevel('europe_pmc')
  yield level('direct', [paper.openAccessPdfUrl])
  yield await sourceLevel('openalex')
  yield await sourceLevel('unpaywall')
  yield await sourceLevel('semantic_scholar')
  const direct: string[] = []
  const arxivId = normalizeArxivId(paper.arxivId)
  if (arxivId !== undefined) direct.push(`https://arxiv.org/pdf/${arxivId}`)
  const doi = normalizeDoi(paper.doi)
  if (doi !== undefined && /^10\.(1101|64898)\//.test(doi)) {
    direct.push(...(await lookup('biorxiv')).pdfUrls)
  }
  if (doi !== undefined && /^10\.48550\/arxiv\./i.test(doi)) {
    direct.push(`https://arxiv.org/pdf/${doi.replace(/^10\.48550\/arxiv\./i, '')}`)
  }
  yield level('preprint', direct)
  yield await sourceLevel('openaire')
  yield await sourceLevel('core')
  if (openAccessOnly) return
  yield await sourceLevel('crossref_page')
  if (paper.landingPageUrl !== undefined) yield level('publisher_patterns', pdfCandidatesFor(paper.landingPageUrl))
  yield await sourceLevel('grayarea')
}

export async function buildFallbackChain(
  paper: PaperMeta, registry: SourceRegistry, signal: AbortSignal, options?: { openAccessOnly?: boolean },
): Promise<FallbackChain> {
  const levels: Level[] = []
  const attempted: string[] = []
  for await (const level of fallbackLevels(paper, registry, signal, attempted, [], options?.openAccessOnly)) {
    if (level.urls.length > 0 || level.landingUrls !== undefined) levels.push(level)
  }
  signal.throwIfAborted()
  return { levels, attempted }
}

/** 从题录整理可直接交给研究者的链接。 */
export function paperLandingLinks(paper: PaperMeta): string[] {
  const doi = normalizeDoi(paper.doi)
  const doiUrl = doi === undefined ? undefined : 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/')
  return [...new Set([paper.landingPageUrl, doiUrl, paper.openAccessPdfUrl].filter((url): url is string => url !== undefined && isHttpUrl(url)))]
}

/** 依次尝试全文位置，验证候选并保存 PDF。 */
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
    /** 下载前通过 Crossref 精确回解 DOI，并核对 paper 中的预期标题。 */
    verifyMetadata?: boolean | undefined
    /** Optional browser downloader: retries failed direct fetches through a real page. */
    browser?: { fetchPdf(url: string, opts: { downloadDir: string; timeoutMs: number; signal?: AbortSignal | undefined }): Promise<{ data: Uint8Array; finalUrl: string } | undefined> } | undefined
  },
  signal: AbortSignal,
): Promise<DownloadResult> {
  signal.throwIfAborted()
  try { await prepareDownloadDir(options.downloadDir) } catch (error) {
    return { error: 'write-error', triedSources: [], message: `目标目录无法写入：${error instanceof Error ? error.message : String(error)}` }
  }
  let metadata: PaperMeta | undefined
  if (options.verifyMetadata === true) {
    const doi = normalizeDoi(paper.doi)
    const source = options.registry.searchSources.find((item) => item.id === 'crossref')
    if (doi === undefined || source === undefined) {
      return { error: 'metadata-unverified', triedSources: [], message: '著录核对需要有效 DOI 和 Crossref 来源，本次未下载。' }
    }
    const records = await source.search({ query: doi, limit: 1 }, signal).catch(() => { signal.throwIfAborted(); return [] })
    metadata = records.find((item) => normalizeDoi(item.doi) === doi)
    if (metadata === undefined) return { error: 'metadata-unverified', triedSources: ['metadata:crossref'], message: 'Crossref 未返回该 DOI 的精确记录；可能未登记或查询失败，本次未下载。' }
    const expected = normalizeTitle(paper.title)
    const actual = normalizeTitle(metadata.title)
    const identifierOnly = normalizeDoi(paper.title) === doi
    if (!identifierOnly && expected !== actual && !expected.startsWith(`${actual} `) && !actual.startsWith(`${expected} `)) {
      return { error: 'metadata-mismatch', triedSources: ['metadata:crossref'], metadata, message: `DOI 对应标题与预期不符，本次未下载。预期：${paper.title}；Crossref：${metadata.title}` }
    }
    paper = { ...mergePapers(paper, metadata), title: metadata.title }
  }
  const triedSources: string[] = []
  const failures: string[] = []
  const attempts: DownloadAttempt[] = []
  const landingLinks = new Set<string>()
  const directLinks = new Set<string>()
  const fetchedUrls = new Set<string>()
  const mismatched = new Set<string>()
  for await (const level of fallbackLevels(paper, options.registry, signal, triedSources, attempts)) {
    const isOpenLevel = level.label !== 'grayarea'
    const candidates = [
      ...level.urls.map((url) => ({ url, parseLanding: isOpenLevel, landing: false })),
      ...(level.landingUrls ?? []).map((url) => ({ url, parseLanding: true, landing: true })),
    ]
    for (const { url, parseLanding, landing } of candidates) {
      signal.throwIfAborted()
      if (isOpenLevel) (landing ? landingLinks : directLinks).add(url)
      if (fetchedUrls.has(url)) continue
      fetchedUrls.add(url)
      const detailed = await fetchPdfBytesDetailed(url, { timeoutMs: options.pdfTimeoutMs, signal, parseLanding })
      if (detailed.landing !== undefined) {
        landingLinks.add(detailed.landing.url)
        fetchedUrls.add(detailed.landing.url)
        for (const link of detailed.landing.links) candidates.push({ url: link, parseLanding: false, landing: false })
      }
      let fetched = detailed.fetch
      if (detailed.failure !== undefined) attempts.push({ source: level.label, url, ...detailed.failure })
      if (fetched === undefined && !landing && !detailed.landing?.links.length && options.browser !== undefined) {
        const viaBrowser = await options.browser.fetchPdf(url, { downloadDir: options.downloadDir, timeoutMs: options.pdfTimeoutMs, signal }).catch(() => undefined)
        if (viaBrowser !== undefined && looksLikePdf(viaBrowser.data) && isHttpUrl(viaBrowser.finalUrl)) {
          fetched = viaBrowser
        }
      }
      if (fetched === undefined) {
        failures.push(`${level.label}:${new URL(url).hostname}(${detailed.failure?.reason ?? 'network'})`)
        continue
      }
      signal.throwIfAborted()
      const pdfVerification = await verifyPdfContent(fetched.data, paper)
      signal.throwIfAborted()
      if (pdfVerification === 'content-mismatch') {
        mismatched.add(url)
        mismatched.add(fetched.finalUrl)
        attempts.push({ source: level.label, url: fetched.finalUrl, reason: 'content-mismatch' })
        failures.push(`${level.label}:${new URL(fetched.finalUrl).hostname}(content-mismatch)`)
        continue
      }
      const filename = safeFilename(paper, options.filename)
      const path = join(options.downloadDir, filename)
      try { await savePdf(path, fetched.data) } catch (error) {
        const exists = (error as NodeJS.ErrnoException).code === 'EEXIST'
        return { error: exists ? 'file-exists' : 'write-error', triedSources, attempts, message: `PDF 未保存：${error instanceof Error ? error.message : String(error)}` }
      }
      return { path: resolve(path), source: level.label, url: fetched.finalUrl, sizeBytes: fetched.data.length, attempts, pdfVerification, ...(metadata !== undefined ? { metadata } : {}) }
    }
  }
  signal.throwIfAborted()
  const manualLinks = [...new Set([...landingLinks, ...paperLandingLinks(paper), ...directLinks])].filter((url) => !mismatched.has(url))
  return {
    error: mismatched.size > 0 ? 'content-mismatch' : 'no-free-fulltext',
    triedSources, attempts, manualLinks,
    failureKind: failures.length > 0 ? 'candidates-failed' : attempts.length > 0 ? 'lookup-failed' : 'no-candidate',
    ...(failures.length > 0 ? { failures } : {}),
  }
}
