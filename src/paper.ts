/**
 * Dedup, merge, and quality-weighted ranking for multi-source results.
 * Key design and weights follow QwenPaw local_paper_hub's
 * `search_pipeline/dedupe.py` and `ranker.py`, translated to TypeScript.
 * @module dsh-scholar-search/paper
 */

import { normalizeArxivId, normalizeDoi, normalizePmid } from './http.js'
import type { PaperMeta } from './types.js'

/** Source quality weights (local_paper_hub `SOURCE_QUALITY`). */
export const SOURCE_QUALITY: Record<string, number> = {
  pubmed: 1.0,
  europe_pmc: 0.92,
  semantic_scholar: 0.86,
  arxiv: 0.85,
  biorxiv: 0.8,
  openalex: 0.78,
  crossref: 0.74,
  doaj: 0.7,
  core: 0.7,
}

const DEFAULT_QUALITY = 0.6

/**
 * Title normalization for the last-resort dedupe key: lowercase, strip
 * punctuation, KEEP CJK characters, collapse whitespace.
 * @param title - raw title.
 * @returns the normalized key fragment.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Dedupe keys of one paper, strongest first:
 * `doi:` → `arxiv:` → `pmid:` → `url:` → `title:`.
 * @param paper - normalized record.
 * @returns the keys this record answers to, first-seen order.
 */
export function paperKeys(paper: PaperMeta): string[] {
  const keys: string[] = []
  const doi = normalizeDoi(paper.doi)
  if (doi !== undefined) keys.push(`doi:${doi}`)
  const arxivId = normalizeArxivId(paper.arxivId)
  if (arxivId !== undefined) keys.push(`arxiv:${arxivId.toLowerCase()}`)
  const pmid = normalizePmid(paper.pmid)
  if (pmid !== undefined) keys.push(`pmid:${pmid}`)
  const url = paper.landingPageUrl?.trim().toLowerCase().replace(/\/+$/, '')
  if (url !== undefined && url.length > 0) keys.push(`url:${url}`)
  const title = normalizeTitle(paper.title)
  if (title.length > 0) keys.push(`title:${title}`)
  return keys
}

/** Quality weight of a source id. */
export function sourceQuality(source: string): number {
  return SOURCE_QUALITY[source] ?? DEFAULT_QUALITY
}

/** Prefer whichever of two optional values is "more complete" (defined, longer). */
function better(current: string | undefined, incoming: string | undefined): string | undefined {
  if (current === undefined) return incoming
  if (incoming === undefined) return current
  return incoming.length > current.length ? incoming : current
}

/**
 * Merge two records of the same paper: `base` keeps its identity (source,
 * sourceId, key order), fields fill in from `incoming` when absent or shorter.
 * @param base - the record already in the merged map.
 * @param incoming - the duplicate being folded in.
 * @returns a new merged record.
 */
export function mergePapers(base: PaperMeta, incoming: PaperMeta): PaperMeta {
  const oaSources = [...new Set([...(base.oaSources ?? [base.source]), incoming.source, ...(incoming.oaSources ?? [])])]
  const merged: PaperMeta = {
    title: base.title.length >= incoming.title.length ? base.title : incoming.title,
    source: sourceQuality(base.source) >= sourceQuality(incoming.source) ? base.source : incoming.source,
    sourceId: sourceQuality(base.source) >= sourceQuality(incoming.source) ? base.sourceId : incoming.sourceId,
    oaSources,
  }
  const authors = (base.authors?.length ?? 0) >= (incoming.authors?.length ?? 0) ? base.authors : incoming.authors
  if (authors !== undefined && authors.length > 0) merged.authors = authors
  const year = base.year ?? incoming.year
  if (year !== undefined) merged.year = year
  const venue = better(base.venue, incoming.venue)
  if (venue !== undefined) merged.venue = venue
  const abstract = better(base.abstract, incoming.abstract)
  if (abstract !== undefined) merged.abstract = abstract
  const doi = base.doi ?? incoming.doi
  if (doi !== undefined) merged.doi = doi
  const arxivId = base.arxivId ?? incoming.arxivId
  if (arxivId !== undefined) merged.arxivId = arxivId
  const pmid = base.pmid ?? incoming.pmid
  if (pmid !== undefined) merged.pmid = pmid
  const pmcid = base.pmcid ?? incoming.pmcid
  if (pmcid !== undefined) merged.pmcid = pmcid
  const citationCount = Math.max(base.citationCount ?? 0, incoming.citationCount ?? 0)
  if (citationCount > 0) merged.citationCount = citationCount
  if (base.isOpenAccess === true || incoming.isOpenAccess === true) merged.isOpenAccess = true
  const pdf = base.openAccessPdfUrl ?? incoming.openAccessPdfUrl
  if (pdf !== undefined) merged.openAccessPdfUrl = pdf
  const landing = base.landingPageUrl ?? incoming.landingPageUrl
  if (landing !== undefined) merged.landingPageUrl = landing
  return merged
}

/**
 * Merge a multi-source result list into one deduped list. Records answering
 * to the same key fold together; the surviving record keeps the strongest
 * source's identity and accumulates `oaSources`.
 * @param papers - raw hits from every source.
 * @returns the deduped list, first-occurrence order.
 */
export function mergePaperLists(papers: PaperMeta[]): PaperMeta[] {
  const merged = new Map<string, PaperMeta>()
  const aliases = new Map<string, string>()
  let fallback = 0
  for (const paper of papers) {
    let keys = paperKeys(paper)
    if (keys.length === 0) keys = [`fallback:${++fallback}`]
    let canonical: string | undefined
    for (const key of keys) {
      const alias = aliases.get(key)
      if (alias !== undefined) {
        canonical = alias
        break
      }
    }
    canonical = canonical ?? keys[0]!
    const current = merged.get(canonical)
    merged.set(canonical, current === undefined ? { ...paper, oaSources: [paper.source] } : mergePapers(current, paper))
    for (const key of keys) aliases.set(key, canonical)
  }
  return [...merged.values()]
}

/**
 * Score one merged paper: source quality, recency (papers from the last 5
 * years get a bonus fading with age), and an OA bonus so downloadable hits
 * float up. Within-source rank is preserved by the caller via a small
 * position term.
 * @param paper - merged record.
 * @param rankInSource - 0-based rank the paper's source returned it at.
 * @param listSize - size of that source's list (for rank normalization).
 * @param nowYear - current year (injectable for tests).
 * @returns the composite score, higher is better.
 */
export function scorePaper(paper: PaperMeta, rankInSource: number, listSize: number, nowYear: number): number {
  const rankScore = listSize > 1 ? 1 - rankInSource / (listSize - 1) : 1
  const quality = sourceQuality(paper.source)
  let recency = 0
  if (paper.year !== undefined) {
    const age = nowYear - paper.year
    if (age >= 0 && age <= 5) recency = 0.15 * (1 - age / 6)
  }
  const oaBonus = paper.openAccessPdfUrl !== undefined ? 0.2 : paper.isOpenAccess === true ? 0.1 : 0
  return rankScore * quality + recency + oaBonus
}

/**
 * Merge and rank the fan-out results of every source. Each original record is
 * scored with its own rank inside its source's list; a merged paper keeps the
 * best score among its duplicates.
 * @param results - per-source lists, each tagged with its source id implicitly via the records.
 * @param limit - cap on the returned list.
 * @param nowYear - current year (injectable for tests).
 * @returns the deduped, ranked list.
 */
export function mergeAndRank(results: PaperMeta[][], limit: number, nowYear: number): PaperMeta[] {
  const merged = new Map<string, { paper: PaperMeta; score: number }>()
  const aliases = new Map<string, string>()
  let fallback = 0
  for (const list of results) {
    list.forEach((paper, index) => {
      const score = scorePaper(paper, index, list.length, nowYear)
      let keys = paperKeys(paper)
      if (keys.length === 0) keys = [`fallback:${++fallback}`]
      let canonical: string | undefined
      for (const key of keys) {
        const alias = aliases.get(key)
        if (alias !== undefined) {
          canonical = alias
          break
        }
      }
      canonical = canonical ?? keys[0]!
      const current = merged.get(canonical)
      merged.set(canonical, current === undefined
        ? { paper: { ...paper, oaSources: [paper.source] }, score }
        : { paper: mergePapers(current.paper, paper), score: Math.max(current.score, score) })
      for (const key of keys) aliases.set(key, canonical)
    })
  }
  const scored = [...merged.values()]
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.max(1, limit)).map((entry) => entry.paper)
}
