/**
 * Crossref REST API. Free with a `mailto`; the DOI registration agency, so
 * the metadata fallback with the widest coverage. `link[]` PDFs usually need
 * a subscription — this source is metadata-first.
 * @module dsh-scholar-search/sources/crossref
 */

import { fetchJson, isRecord, normalizeDoi, num, str } from '../http.js'
import type { FetchOptions } from '../http.js'
import type { PaperMeta, ScholarSource, SearchQuery } from '../types.js'

export const CROSSREF_API = 'https://api.crossref.org/works'

/** First year out of a Crossref date-parts array (`[[2024, 3, 2]]`). */
function datePartsYear(value: unknown): number | undefined {
  if (!isRecord(value) || !Array.isArray(value['date-parts'])) return undefined
  const parts = value['date-parts'][0]
  if (!Array.isArray(parts)) return undefined
  const year = parts[0]
  return typeof year === 'number' && Number.isInteger(year) ? year : undefined
}

/**
 * Map one Crossref work onto {@link PaperMeta}.
 * @param record - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export function normalizeCrossrefWork(record: unknown): PaperMeta | undefined {
  if (!isRecord(record)) return undefined
  const titles = Array.isArray(record.title) ? record.title : []
  const title = titles.find((t): t is string => typeof t === 'string' && t.trim().length > 0)?.trim()
  if (title === undefined) return undefined
  const doi = normalizeDoi(str(record, 'DOI'))
  if (doi === undefined) return undefined
  const authors: string[] = []
  if (Array.isArray(record.author)) {
    for (const author of record.author) {
      if (!isRecord(author)) continue
      const given = str(author, 'given')
      const family = str(author, 'family')
      const name = [given, family].filter((p): p is string => p !== undefined).join(' ')
      if (name.length > 0) authors.push(name)
    }
  }
  const printYear = datePartsYear(record['published-print'])
  const onlineYear = datePartsYear(record['published-online'])
  const year = printYear ?? datePartsYear(record.issued) ?? datePartsYear(record.published) ?? onlineYear
  const container = Array.isArray(record['container-title']) ? record['container-title'] : []
  const venue = container.find((t): t is string => typeof t === 'string' && t.trim().length > 0)?.trim()
  // Crossref link[] PDFs are usually paywalled; only keep an explicit text-mining PDF.
  let pdfUrl: string | undefined
  if (Array.isArray(record.link)) {
    for (const link of record.link) {
      if (!isRecord(link)) continue
      if (str(link, 'content-type') !== 'application/pdf') continue
      const url = str(link, 'URL')
      if (url !== undefined) {
        pdfUrl = url
        break
      }
    }
  }
  const abstractRaw = str(record, 'abstract')?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const paper: PaperMeta = {
    title,
    source: 'crossref',
    sourceId: doi,
    doi,
    landingPageUrl: `https://doi.org/${doi}`,
  }
  if (authors.length > 0) paper.authors = authors
  if (year !== undefined) paper.year = year
  if (printYear !== undefined) paper.printYear = printYear
  if (onlineYear !== undefined) paper.onlineYear = onlineYear
  for (const [field, key] of [['volume', 'volume'], ['issue', 'issue'], ['pages', 'page'], ['articleNumber', 'article-number']] as const) {
    const value = str(record, key)
    if (value !== undefined) paper[field] = value
  }
  if (venue !== undefined) paper.venue = venue
  if (abstractRaw !== undefined && abstractRaw.length > 0) paper.abstract = abstractRaw
  const citations = num(record, 'is-referenced-by-count')
  if (citations !== undefined) paper.citationCount = Math.trunc(citations)
  if (pdfUrl !== undefined) paper.openAccessPdfUrl = pdfUrl
  return paper
}

/**
 * Create the Crossref source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export function crossrefSource(options: () => FetchOptions): ScholarSource {
  return {
    id: 'crossref',
    async search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]> {
      const opts = options()
      const doi = normalizeDoi(query.query)
      if (doi !== undefined) {
        const params = new URLSearchParams()
        if (opts.email !== undefined && opts.email.length > 0) params.set('mailto', opts.email)
        const data = await fetchJson(`${CROSSREF_API}/${encodeURIComponent(doi)}?${params.toString()}`, { ...opts, signal })
        const paper = isRecord(data) ? normalizeCrossrefWork(data.message) : undefined
        return paper !== undefined && normalizeDoi(paper.doi) === doi ? [paper] : []
      }
      const params = new URLSearchParams({
        query: query.query,
        rows: String(Math.min(Math.max(1, query.limit ?? 20), 200)),
        select: 'DOI,title,author,published,published-print,published-online,issued,volume,issue,page,article-number,container-title,abstract,is-referenced-by-count,link',
      })
      if (query.yearFrom !== undefined || query.yearTo !== undefined) {
        const from = query.yearFrom ?? 1600
        const to = query.yearTo ?? 9999
        params.set('filter', `from-pub-date:${from}-01-01,until-pub-date:${to}-12-31`)
      }
      if (opts.email !== undefined && opts.email.length > 0) params.set('mailto', opts.email)
      const data = await fetchJson(`${CROSSREF_API}?${params.toString()}`, { ...opts, signal })
      if (!isRecord(data) || !isRecord(data.message) || !Array.isArray(data.message.items)) return []
      return data.message.items.map(normalizeCrossrefWork).filter((p): p is PaperMeta => p !== undefined)
    },
  }
}
