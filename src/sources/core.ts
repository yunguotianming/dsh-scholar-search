/**
 * CORE — the largest OA repository aggregator. Needs a free API key; without
 * one the source reports itself unavailable and is skipped by the fan-out.
 * @module dsh-scholar-search/sources/core
 */

import { fetchJson, isRecord, normalizeDoi, str } from '../http.js'
import type { FetchOptions } from '../http.js'
import type { PaperMeta, ScholarSource, SearchQuery } from '../types.js'

export const CORE_API = 'https://api.core.ac.uk/v3/search/works'

/**
 * Map one CORE work onto {@link PaperMeta}.
 * @param record - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export function normalizeCoreWork(record: unknown): PaperMeta | undefined {
  if (!isRecord(record)) return undefined
  const title = str(record, 'title')
  if (title === undefined) return undefined
  const id = str(record, 'id')
  if (id === undefined) return undefined
  const doi = normalizeDoi(str(record, 'doi'))
  const authors: string[] = []
  if (Array.isArray(record.authors)) {
    for (const author of record.authors) {
      if (!isRecord(author)) continue
      const name = str(author, 'name')
      if (name !== undefined) authors.push(name)
    }
  }
  const yearPublished = record.yearPublished
  const year = typeof yearPublished === 'number' && Number.isInteger(yearPublished) ? yearPublished : undefined
  const downloadUrl = str(record, 'downloadUrl')
  const paper: PaperMeta = { title, source: 'core', sourceId: id, isOpenAccess: true }
  if (authors.length > 0) paper.authors = authors
  if (year !== undefined) paper.year = year
  const abstract = str(record, 'abstract')
  if (abstract !== undefined) paper.abstract = abstract
  if (doi !== undefined) paper.doi = doi
  if (downloadUrl !== undefined) paper.openAccessPdfUrl = downloadUrl
  const fullTextLink = str(record, 'fullTextLink') ?? (doi !== undefined ? `https://doi.org/${doi}` : undefined)
  if (fullTextLink !== undefined) paper.landingPageUrl = fullTextLink
  return paper
}

/**
 * Create the CORE source.
 * @param options - shared fetch options source.
 * @param apiKey - CORE API key read per call; `search` returns `[]` when absent.
 * @returns the source.
 */
export function coreSource(options: () => FetchOptions, apiKey: () => string | undefined): ScholarSource {
  const key = (): string | undefined => {
    const k = apiKey()
    return k !== undefined && k.length > 0 ? k : undefined
  }
  return {
    id: 'core',
    async search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]> {
      const apiKeyValue = key()
      // No key → skip silently; the fan-out treats this as "source unavailable".
      if (apiKeyValue === undefined) return []
      const opts = options()
      let q = query.query
      if (query.yearFrom !== undefined || query.yearTo !== undefined) {
        const from = query.yearFrom ?? 1600
        const to = query.yearTo ?? 9999
        q = `${q} AND yearPublished>=${from} AND yearPublished<=${to}`
      }
      const params = new URLSearchParams({ q, limit: String(Math.min(Math.max(1, query.limit ?? 20), 100)) })
      const data = await fetchJson(`${CORE_API}?${params.toString()}`, {
        ...opts,
        headers: { 'Authorization': `Bearer ${apiKeyValue}` },
        signal,
      })
      if (!isRecord(data) || !Array.isArray(data.results)) return []
      return data.results.map(normalizeCoreWork).filter((p): p is PaperMeta => p !== undefined)
    },
    async resolvePdf(paper: PaperMeta, signal: AbortSignal): Promise<string | undefined> {
      const apiKeyValue = key()
      if (apiKeyValue === undefined) return undefined
      const doi = normalizeDoi(paper.doi)
      if (doi === undefined) return undefined
      const opts = options()
      const params = new URLSearchParams({ q: `doi:"${doi}"`, limit: '1' })
      const data = await fetchJson(`${CORE_API}?${params.toString()}`, {
        ...opts,
        headers: { 'Authorization': `Bearer ${apiKeyValue}` },
        signal,
      })
      if (!isRecord(data) || !Array.isArray(data.results)) return undefined
      return normalizeCoreWork(data.results[0])?.openAccessPdfUrl
    },
  }
}
