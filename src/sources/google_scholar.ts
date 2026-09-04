/**
 * Google Scholar via SerpAPI. Google Scholar has no official API; SerpAPI is
 * the only stable, sanctioned route (paid, free tier 100 searches/month). The
 * source is skipped entirely without a key.
 * @module dsh-scholar-search/sources/google-scholar
 */

import { fetchJson, isRecord, normalizeDoi, num, str } from '../http.js'
import type { FetchOptions } from '../http.js'
import type { PaperMeta, ScholarSource, SearchQuery } from '../types.js'

export const SERPAPI_SCHOLAR_API = 'https://serpapi.com/search'

/**
 * Map one SerpAPI organic result onto {@link PaperMeta}. SerpAPI returns
 * `organic_results[]` with `title`, `link`, `publication_info.summary`,
 * `inline_links.cited_by.total`, and optional `resources[]` with PDF links.
 * @param record - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export function normalizeSerpApiResult(record: unknown): PaperMeta | undefined {
  if (!isRecord(record)) return undefined
  const title = str(record, 'title')
  if (title === undefined) return undefined
  const link = str(record, 'link')
  const position = num(record, 'position')
  const paper: PaperMeta = {
    title,
    source: 'google_scholar',
    sourceId: position !== undefined ? `serpapi:${Math.trunc(position)}` : link ?? title,
  }

  const pubInfo = isRecord(record.publication_info) ? record.publication_info : undefined
  const summary = pubInfo !== undefined ? str(pubInfo, 'summary') : undefined
  if (summary !== undefined) {
    // "A Vaswani, N Shazeer - arXiv preprint arXiv:1706.03762, 2017" → authors + venue + year.
    const yearMatch = /\b(19|20)\d{2}\b/.exec(summary)
    if (yearMatch !== null) paper.year = Number.parseInt(yearMatch[0], 10)
    const dashSplit = summary.split(' - ')
    if (dashSplit.length > 0) {
      const authorsPart = dashSplit[0]?.trim()
      if (authorsPart !== undefined && authorsPart.length > 0) {
        paper.authors = authorsPart.split(',').map((a) => a.trim()).filter((a) => a.length > 0)
      }
    }
    const venuePart = dashSplit[1]?.trim()
    if (venuePart !== undefined && venuePart.length > 0) {
      const venue = venuePart.replace(/,?\s*\d{4}.*$/, '').trim()
      if (venue.length > 0) paper.venue = venue
    }
  }

  const inlineLinks = isRecord(record.inline_links) ? record.inline_links : undefined
  const citedBy = inlineLinks !== undefined && isRecord(inlineLinks.cited_by) ? inlineLinks.cited_by : undefined
  const citations = citedBy !== undefined ? num(citedBy, 'total') : undefined
  if (citations !== undefined) paper.citationCount = Math.trunc(citations)

  if (Array.isArray(record.resources)) {
    for (const res of record.resources) {
      if (!isRecord(res)) continue
      if (str(res, 'file_format')?.toUpperCase() === 'PDF') {
        const pdfLink = str(res, 'link')
        if (pdfLink !== undefined) {
          paper.openAccessPdfUrl = pdfLink
          paper.isOpenAccess = true
          break
        }
      }
    }
  }

  if (link !== undefined) {
    paper.landingPageUrl = link
    const doi = normalizeDoi(link)
    if (doi !== undefined) paper.doi = doi
  }

  return paper
}

/**
 * Create the Google Scholar source. Skips (returns empty results) when no
 * SerpAPI key is configured.
 * @param options - shared fetch options source.
 * @param apiKey - SerpAPI key read per call.
 * @returns the source.
 */
export function googleScholarSource(options: () => FetchOptions, apiKey: () => string | undefined): ScholarSource {
  return {
    id: 'google_scholar',
    async search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]> {
      const key = apiKey()
      if (key === undefined || key.length === 0) return []
      const opts = options()
      const params = new URLSearchParams({
        engine: 'google_scholar',
        q: query.query,
        num: String(Math.min(Math.max(1, query.limit ?? 20), 20)),
        api_key: key,
      })
      if (query.yearFrom !== undefined) params.set('as_ylo', String(query.yearFrom))
      if (query.yearTo !== undefined) params.set('as_yhi', String(query.yearTo))
      const data = await fetchJson(`${SERPAPI_SCHOLAR_API}?${params.toString()}`, { ...opts, signal })
      if (!isRecord(data) || !Array.isArray(data.organic_results)) return []
      return data.organic_results.map(normalizeSerpApiResult).filter((p): p is PaperMeta => p !== undefined)
    },
  }
}
