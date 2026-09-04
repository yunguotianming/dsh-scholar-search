/**
 * PubMed via NCBI E-utilities (esearch + esummary). Free; an optional API key
 * raises the limit from 3 to 10 req/s. The authoritative metadata source for
 * biomedicine (highest quality weight) — full text comes from Europe PMC.
 * @module dsh-scholar-search/sources/pubmed
 */

import { fetchJson, isRecord, normalizeDoi, normalizePmcid, str } from '../http.js'
import type { FetchOptions } from '../http.js'
import type { PaperMeta, ScholarSource, SearchQuery } from '../types.js'

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

/**
 * Map one esummary record onto {@link PaperMeta}.
 * @param record - untyped esummary doc.
 * @param pmid - the PMID this record was keyed by.
 * @returns the normalized paper, or `undefined` without a title.
 */
export function normalizePubmedSummary(record: unknown, pmid: string): PaperMeta | undefined {
  if (!isRecord(record)) return undefined
  const title = str(record, 'title')
  if (title === undefined) return undefined
  let doi: string | undefined
  let pmcid: string | undefined
  if (Array.isArray(record.articleids)) {
    for (const id of record.articleids) {
      if (!isRecord(id)) continue
      const idType = str(id, 'idtype')
      const value = str(id, 'value')
      if (value === undefined) continue
      if (idType === 'doi') doi = normalizeDoi(value)
      else if (idType === 'pmc') pmcid = normalizePmcid(value)
    }
  }
  const authors: string[] = []
  if (Array.isArray(record.authors)) {
    for (const author of record.authors) {
      if (!isRecord(author)) continue
      const name = str(author, 'name')
      if (name !== undefined) authors.push(name)
    }
  }
  const pubdate = str(record, 'pubdate')
  const yearMatch = pubdate !== undefined ? /^(\d{4})/.exec(pubdate) : null
  const paper: PaperMeta = { title, source: 'pubmed', sourceId: pmid, pmid }
  if (authors.length > 0) paper.authors = authors
  if (yearMatch !== null) paper.year = Number.parseInt(yearMatch[1]!, 10)
  const venue = str(record, 'fulljournalname') ?? str(record, 'source')
  if (venue !== undefined) paper.venue = venue
  if (doi !== undefined) paper.doi = doi
  if (pmcid !== undefined) paper.pmcid = pmcid
  paper.landingPageUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
  return paper
}

/**
 * Create the PubMed source.
 * @param options - shared fetch options source.
 * @param apiKey - optional NCBI API key read per call.
 * @returns the source.
 */
export function pubmedSource(options: () => FetchOptions, apiKey: () => string | undefined): ScholarSource {
  return {
    id: 'pubmed',
    async search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]> {
      const opts = options()
      const key = apiKey()
      const termParts: string[] = [query.query]
      if (query.yearFrom !== undefined || query.yearTo !== undefined) {
        const from = query.yearFrom ?? 1600
        const to = query.yearTo ?? 3000
        termParts.push(`("${from}"[Date - Publication] : "${to}"[Date - Publication])`)
      }
      const searchParams = new URLSearchParams({
        db: 'pubmed',
        term: termParts.join(' AND '),
        retmax: String(Math.min(Math.max(1, query.limit ?? 20), 200)),
        retmode: 'json',
      })
      if (key !== undefined && key.length > 0) searchParams.set('api_key', key)
      const searchData = await fetchJson(`${EUTILS}/esearch.fcgi?${searchParams.toString()}`, { ...opts, signal })
      if (!isRecord(searchData) || !isRecord(searchData.esearchresult)) return []
      const idlist = searchData.esearchresult.idlist
      if (!Array.isArray(idlist) || idlist.length === 0) return []
      const pmids = idlist.filter((id): id is string => typeof id === 'string')

      const summaryParams = new URLSearchParams({ db: 'pubmed', id: pmids.join(','), retmode: 'json' })
      if (key !== undefined && key.length > 0) summaryParams.set('api_key', key)
      const summaryData = await fetchJson(`${EUTILS}/esummary.fcgi?${summaryParams.toString()}`, { ...opts, signal })
      if (!isRecord(summaryData) || !isRecord(summaryData.result)) return []
      const papers: PaperMeta[] = []
      for (const pmid of pmids) {
        const paper = normalizePubmedSummary(summaryData.result[pmid], pmid)
        if (paper !== undefined) papers.push(paper)
      }
      return papers
    },
  }
}
