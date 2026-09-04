/**
 * crossref_page — resolve a DOI to its publisher landing page and mine the
 * `citation_pdf_url` meta tag. Only OA publishers expose that tag, so this
 * never circumvents a paywall; it just reads what the page already declares.
 * `resolvePdf` only.
 * @module dsh-scholar-search/sources/crossref_page
 */

import { fetchText, isHttpUrl, normalizeDoi } from '../http.js'
import type { FetchOptions } from '../http.js'
import type { PaperMeta, ScholarSource } from '../types.js'

/** Extract the `citation_pdf_url` meta content out of an HTML page. Exported for tests. */
export function citationPdfUrlFromHtml(html: string, baseUrl: string): string | undefined {
  const metaRe = /<meta\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = metaRe.exec(html)) !== null) {
    const tag = m[0]
    const nameMatch = /\bname\s*=\s*["']?citation_pdf_url["']?/i.exec(tag)
    if (nameMatch === null) continue
    const contentMatch = /\bcontent\s*=\s*"([^"]+)"|\bcontent\s*=\s*'([^']+)'/i.exec(tag)
    const raw = contentMatch?.[1] ?? contentMatch?.[2]
    if (raw === undefined || raw.trim().length === 0) continue
    try {
      const resolved = new URL(raw.trim(), baseUrl).toString()
      if (isHttpUrl(resolved)) return resolved
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * Create the crossref_page link-enrichment source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export function crossrefPageSource(options: () => FetchOptions): ScholarSource {
  return {
    id: 'crossref_page',
    async search(): Promise<PaperMeta[]> {
      return []
    },
    async resolvePdf(paper: PaperMeta, signal: AbortSignal): Promise<string | undefined> {
      const doi = normalizeDoi(paper.doi)
      if (doi === undefined) return undefined
      const opts = options()
      const result = await fetchText(`https://doi.org/${encodeURI(doi)}`, {
        ...opts,
        headers: { 'Accept': 'text/html,*/*;q=0.8' },
        signal,
      })
      if (result === undefined) return undefined
      // fetchText already validated the final URL stays http(s) after redirects.
      return citationPdfUrlFromHtml(result.body, result.finalUrl)
    },
  }
}
