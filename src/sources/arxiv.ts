/**
 * arXiv via the public Atom API. Free, no key; hand-rolled XML parsing (the
 * feed is small and regular, a full XML dependency is not). PDF is a direct
 * `arxiv.org/pdf/{id}` link.
 * @module dsh-scholar-search/sources/arxiv
 */

import { fetchText, normalizeArxivId, normalizeDoi } from '../http.js'
import type { FetchOptions } from '../http.js'
import type { PaperMeta, ScholarSource, SearchQuery } from '../types.js'

export const ARXIV_API = 'https://export.arxiv.org/api/query'

/** Decode the XML entities arXiv Atom feeds use. */
function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
}

/** Parse one arXiv Atom feed into normalized papers. Exported for tests. */
export function parseArxivFeed(xml: string): PaperMeta[] {
  const papers: PaperMeta[] = []
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(xml)) !== null) {
    const e = m[1]!
    const tag = (t: string): string => {
      const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(e)
      return r !== null ? decodeXml(r[1]!.trim()) : ''
    }
    const title = tag('title').replace(/\s+/g, ' ')
    const idUrl = tag('id')
    const id = normalizeArxivId(idUrl)
    if (title.length === 0 || id === undefined) continue
    const abstract = tag('summary').replace(/\s+/g, ' ')
    const published = tag('published')
    const authors: string[] = []
    const authRe = /<author>\s*<name>([^<]+)<\/name>/g
    let am: RegExpExecArray | null
    while ((am = authRe.exec(e)) !== null) authors.push(decodeXml(am[1]!.trim()))
    const doiMatch = /<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/.exec(e)
    const journalRef = /<arxiv:journal_ref[^>]*>([^<]+)<\/arxiv:journal_ref>/.exec(e)
    const yearMatch = /^(\d{4})/.exec(published)
    const doi = doiMatch !== null ? normalizeDoi(doiMatch[1]!.trim()) : undefined
    const paper: PaperMeta = {
      title,
      source: 'arxiv',
      sourceId: id,
      arxivId: id,
      isOpenAccess: true,
      openAccessPdfUrl: `https://arxiv.org/pdf/${id}`,
      landingPageUrl: `https://arxiv.org/abs/${id}`,
    }
    if (authors.length > 0) paper.authors = authors
    if (yearMatch !== null) paper.year = Number.parseInt(yearMatch[1]!, 10)
    if (journalRef !== null) paper.venue = decodeXml(journalRef[1]!.trim())
    if (abstract.length > 0) paper.abstract = abstract
    if (doi !== undefined) paper.doi = doi
    papers.push(paper)
  }
  return papers
}

/**
 * Create the arXiv source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export function arxivSource(options: () => FetchOptions): ScholarSource {
  return {
    id: 'arxiv',
    async search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]> {
      const opts = options()
      let searchQuery = query.query
      // arXiv search syntax supports submittedDate ranges; filter by year client-side too.
      const params = new URLSearchParams({
        search_query: searchQuery,
        start: '0',
        max_results: String(Math.min(Math.max(1, query.limit ?? 20), 100)),
        sortBy: 'relevance',
        sortOrder: 'descending',
      })
      const result = await fetchText(`${ARXIV_API}?${params.toString()}`, { ...opts, signal })
      if (result === undefined) return []
      let papers = parseArxivFeed(result.body)
      if (query.yearFrom !== undefined) papers = papers.filter((p) => p.year === undefined || p.year >= (query.yearFrom as number))
      if (query.yearTo !== undefined) papers = papers.filter((p) => p.year === undefined || p.year <= (query.yearTo as number))
      return papers
    },
    async resolvePdf(paper: PaperMeta): Promise<string | undefined> {
      const id = normalizeArxivId(paper.arxivId)
      return id !== undefined ? `https://arxiv.org/pdf/${id}` : undefined
    },
  }
}
