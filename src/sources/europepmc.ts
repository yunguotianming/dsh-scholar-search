/**
 * Europe PMC REST search. Free, no key. Biomedical full text: `fullTextUrlList`
 * carries free-full-text links and `pmcid` maps onto PMC OA PDFs.
 * @module dsh-scholar-search/sources/europepmc
 */

import { fetchJson, isRecord, normalizeDoi, normalizePmcid, normalizePmid, str } from '../http.js'
import type { FetchOptions } from '../http.js'
import type { PaperMeta, ScholarSource, SearchQuery } from '../types.js'

export const EUROPEPMC_API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'

/**
 * Europe PMC's official PDF download endpoint (empirically the highest-yield
 * channel for PMC-indexed OA papers). Two equivalent forms; the api/getPdf one
 * is preferred. Intermittently 403s — the caller retries.
 */
export function europePmcOfficialPdfUrl(pmcid: string): string {
  const bare = normalizePmcid(pmcid)
  return bare !== undefined ? `https://europepmc.org/api/getPdf?pmcid=${bare}` : ''
}

/** Extract the PMCID out of a Europe PMC search record, when it has a PMC-hosted OA PDF. */
export function europePmcPmcidWithPdf(record: unknown): string | undefined {
  if (!isRecord(record)) return undefined
  const pmcid = normalizePmcid(str(record, 'pmcid'))
  if (pmcid === undefined) return undefined
  // hasPDF/inPMC/isOpenAccess all 'N' means no legal full text — skip early.
  if (str(record, 'hasPDF') === 'N' || str(record, 'inPMC') === 'N') return undefined
  return pmcid
}

/** Pick the first free PDF-looking URL out of a `fullTextUrlList` entry list. */
export function europePmcPdfUrl(record: Record<string, unknown>): string | undefined {
  const list = isRecord(record.fullTextUrlList) ? record.fullTextUrlList.fullTextUrl : undefined
  if (!Array.isArray(list)) return undefined
  for (const entry of list) {
    if (!isRecord(entry)) continue
    const availability = str(entry, 'availability')?.toLowerCase()
    if (availability !== 'free' && availability !== 'open access') continue
    const url = str(entry, 'url')
    if (url === undefined) continue
    const style = str(entry, 'documentStyle')?.toLowerCase()
    // Europe PMC's own renderer ends in ?pdf=render; publisher PDFs end in .pdf.
    if (style === 'pdf' || /\.pdf($|[?#])/i.test(url) || /[?&]pdf=render/.test(url)) return url
  }
  return undefined
}

/**
 * Map one Europe PMC result onto {@link PaperMeta}.
 * @param record - untyped result record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export function normalizeEuropePmcResult(record: unknown): PaperMeta | undefined {
  if (!isRecord(record)) return undefined
  const title = str(record, 'title')
  if (title === undefined) return undefined
  const id = str(record, 'id')
  if (id === undefined) return undefined
  const doi = normalizeDoi(str(record, 'doi'))
  const pmcid = normalizePmcid(str(record, 'pmcid'))
  const pmid = normalizePmid(str(record, 'pmid') ?? (str(record, 'source') === 'MED' ? id : undefined))
  const authors = (str(record, 'authorString') ?? '')
    .split(',')
    .map((a) => a.trim().replace(/\.$/, ''))
    .filter((a) => a.length > 0)
  const yearRaw = str(record, 'pubYear')
  const year = yearRaw !== undefined && /^\d{4}$/.test(yearRaw) ? Number.parseInt(yearRaw, 10) : undefined
  const isOpenAccess = str(record, 'isOpenAccess') === 'Y'
  const pdfUrl = europePmcPdfUrl(record)
    ?? (pmcid !== undefined && isOpenAccess ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/pdf/` : undefined)
  const paper: PaperMeta = { title, source: 'europe_pmc', sourceId: id }
  if (authors.length > 0) paper.authors = authors
  if (year !== undefined) paper.year = year
  const venue = str(record, 'journalTitle')
  if (venue !== undefined) paper.venue = venue
  const abstract = str(record, 'abstractText')?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (abstract !== undefined && abstract.length > 0) paper.abstract = abstract
  if (doi !== undefined) paper.doi = doi
  if (pmid !== undefined) paper.pmid = pmid
  if (pmcid !== undefined) paper.pmcid = pmcid
  if (isOpenAccess) paper.isOpenAccess = true
  if (pdfUrl !== undefined) paper.openAccessPdfUrl = pdfUrl
  paper.landingPageUrl = pmid !== undefined
    ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    : `https://europepmc.org/article/${str(record, 'source') ?? 'MED'}/${id}`
  return paper
}

/**
 * Create the Europe PMC source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export function europePmcSource(options: () => FetchOptions): ScholarSource {
  return {
    id: 'europe_pmc',
    async search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]> {
      const opts = options()
      let q = query.query
      if (query.yearFrom !== undefined || query.yearTo !== undefined) {
        const from = query.yearFrom ?? 1600
        const to = query.yearTo ?? 3000
        q = `(${q}) AND FIRST_PDATE:[${from}-01-01 TO ${to}-12-31]`
      }
      const params = new URLSearchParams({
        query: q,
        format: 'json',
        pageSize: String(Math.min(Math.max(1, query.limit ?? 20), 200)),
      })
      const data = await fetchJson(`${EUROPEPMC_API}?${params.toString()}`, { ...opts, signal })
      if (!isRecord(data) || !isRecord(data.resultList) || !Array.isArray(data.resultList.result)) return []
      return data.resultList.result.map(normalizeEuropePmcResult).filter((p): p is PaperMeta => p !== undefined)
    },
    async resolvePdf(paper: PaperMeta, signal: AbortSignal): Promise<string | undefined> {
      // Fast path: the paper already carries a PMCID — go straight to the
      // official PDF endpoint, no metadata round-trip.
      const directPmcid = normalizePmcid(paper.pmcid)
      if (directPmcid !== undefined) return europePmcOfficialPdfUrl(directPmcid)

      // Reverse-lookup: DOI/PMID → PMCID, then the official PDF endpoint. This
      // is the channel that turns "publisher blocked" into "downloaded" for the
      // large share of biomedical papers that have a PMC OA copy.
      const doi = normalizeDoi(paper.doi)
      const pmid = normalizePmid(paper.pmid)
      const q = doi !== undefined ? `DOI:"${doi}"` : pmid !== undefined ? `EXT_ID:${pmid} AND SRC:MED` : undefined
      if (q === undefined) return undefined
      const opts = options()
      const params = new URLSearchParams({ query: q, format: 'json', pageSize: '1', resultType: 'core' })
      const data = await fetchJson(`${EUROPEPMC_API}?${params.toString()}`, { ...opts, signal })
      if (!isRecord(data) || !isRecord(data.resultList) || !Array.isArray(data.resultList.result)) return undefined
      const record = data.resultList.result[0]
      // Prefer the PMC official endpoint whenever the record has a PMC PDF;
      // fall back to whatever OA url the record surfaces.
      const pmcid = europePmcPmcidWithPdf(record)
      if (pmcid !== undefined) return europePmcOfficialPdfUrl(pmcid)
      const normalized = normalizeEuropePmcResult(record)
      return normalized?.openAccessPdfUrl
    },
  }
}
