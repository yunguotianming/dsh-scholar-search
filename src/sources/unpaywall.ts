/**
 * Unpaywall — the authoritative DOI → OA PDF resolver. Free; requires an
 * email. `resolvePdf` only (it is not a search engine).
 * @module dsh-scholar-search/sources/unpaywall
 */

import { fetchJson, isHttpUrl, isRecord, normalizeDoi, str } from '../http.js'
import type { FetchOptions } from '../http.js'
import type { PaperMeta, PdfLocations, ScholarSource } from '../types.js'

export const UNPAYWALL_API = 'https://api.unpaywall.org/v2'

/** Extract the best OA PDF URL out of an Unpaywall record. Exported for tests. */
export function unpaywallPdfUrl(record: unknown): string | undefined {
  return unpaywallPdfLocations(record).pdfUrls[0]
}

function unpaywallPdfLocations(record: unknown): PdfLocations {
  if (!isRecord(record)) return { pdfUrls: [], landingUrls: [] }
  const locations = [record.best_oa_location, ...(Array.isArray(record.oa_locations) ? record.oa_locations : [])]
  const pdfUrls = new Set<string>()
  const landingUrls = new Set<string>()
  for (const location of locations) {
    if (!isRecord(location)) continue
    const pdf = str(location, 'url_for_pdf')
    const url = str(location, 'url')
    const landing = str(location, 'url_for_landing_page') ?? url
    if (pdf !== undefined && isHttpUrl(pdf)) pdfUrls.add(pdf)
    if (pdf === undefined && url !== undefined && isHttpUrl(url) && /\.pdf($|[?#])/i.test(url)) pdfUrls.add(url)
    if (landing !== undefined && isHttpUrl(landing)) landingUrls.add(landing)
  }
  return { pdfUrls: [...pdfUrls], landingUrls: [...landingUrls].filter((url) => !pdfUrls.has(url)) }
}

/**
 * Create the Unpaywall link-enrichment source.
 * @param options - shared fetch options source (must include the email).
 * @returns the source.
 */
export function unpaywallSource(options: () => FetchOptions): ScholarSource {
  async function resolvePdfLocations(paper: PaperMeta, signal: AbortSignal): Promise<PdfLocations> {
    const doi = normalizeDoi(paper.doi)
    const opts = options()
    if (doi === undefined || !opts.email) return { pdfUrls: [], landingUrls: [] }
    const data = await fetchJson(`${UNPAYWALL_API}/${encodeURIComponent(doi)}?email=${encodeURIComponent(opts.email)}`, { ...opts, signal })
    return unpaywallPdfLocations(data)
  }
  return {
    id: 'unpaywall',
    async search(): Promise<PaperMeta[]> {
      // Link-enrichment only; never part of the search fan-out.
      return []
    },
    async resolvePdf(paper: PaperMeta, signal: AbortSignal): Promise<string | undefined> {
      return (await resolvePdfLocations(paper, signal)).pdfUrls[0]
    },
    resolvePdfLocations,
  }
}
