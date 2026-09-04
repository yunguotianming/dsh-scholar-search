/**
 * `scholar_search` — federated free-literature search: fan out to the enabled
 * sources in parallel, dedupe + merge + quality-rank, return PaperMeta[].
 * @module dsh-scholar-search/tools/search
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import { mergeAndRank } from '../paper.js'
import type { Runtime } from '../runtime.js'
import { SEARCH_SOURCE_IDS } from '../sources/index.js'
import type { PaperMeta } from '../types.js'

/** Output schema of one paper in the result list. */
export const PAPER_META_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', required: true },
    authors: { type: 'array', items: { type: 'string' } },
    year: { type: 'integer' },
    venue: { type: 'string' },
    abstract: { type: 'string' },
    doi: { type: 'string' },
    arxivId: { type: 'string' },
    pmid: { type: 'string' },
    pmcid: { type: 'string' },
    citationCount: { type: 'integer' },
    isOpenAccess: { type: 'boolean' },
    openAccessPdfUrl: { type: 'string' },
    landingPageUrl: { type: 'string' },
    source: { type: 'string', required: true },
    sourceId: { type: 'string', required: true },
    oaSources: { type: 'array', items: { type: 'string' } },
  },
} as const

/** Output schema of `scholar_search`. */
export const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', required: true },
    total: { type: 'integer', required: true, description: 'Papers returned after dedupe and ranking.' },
    papers: { type: 'array', required: true, items: PAPER_META_SCHEMA },
    searchedSources: { type: 'array', required: true, items: { type: 'string' } },
    failedSources: { type: 'array', items: { type: 'string' }, description: 'Sources that errored and were skipped.' },
  },
} as const

/** Canonical value of `scholar_search`. */
export interface SearchValue {
  query: string
  total: number
  papers: PaperMeta[]
  searchedSources: string[]
  failedSources?: string[]
}

/** Strip undefined optionals so the value satisfies `exactOptionalPropertyTypes` and the schema. */
export function compactPaper(paper: PaperMeta): PaperMeta {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(paper)) {
    if (value !== undefined) out[key] = value
  }
  return out as unknown as PaperMeta
}

/** Model-facing rendering: one line per paper, identifiers and OA status visible. */
export function renderSearch(value: SearchValue): { type: 'text'; text: string }[] {
  const lines: string[] = []
  lines.push(`Scholar search "${value.query}": ${value.total} merged result(s) from ${value.searchedSources.join(', ')}${value.failedSources !== undefined && value.failedSources.length > 0 ? ` (skipped: ${value.failedSources.join(', ')})` : ''}.`)
  value.papers.forEach((paper, index) => {
    const head = `${index + 1}. ${paper.title}${paper.year !== undefined ? ` (${paper.year})` : ''}${paper.venue !== undefined ? ` — ${paper.venue}` : ''}`
    const ids: string[] = []
    if (paper.doi !== undefined) ids.push(`doi:${paper.doi}`)
    if (paper.arxivId !== undefined) ids.push(`arxiv:${paper.arxivId}`)
    if (paper.pmid !== undefined) ids.push(`pmid:${paper.pmid}`)
    if (paper.citationCount !== undefined) ids.push(`cited ${paper.citationCount}`)
    ids.push(`via ${(paper.oaSources ?? [paper.source]).join('+')}`)
    lines.push(`   ${head}\n   ${ids.join(' · ')}`)
    if (paper.openAccessPdfUrl !== undefined) lines.push(`   OA PDF: ${paper.openAccessPdfUrl}`)
    if (paper.abstract !== undefined) lines.push(`   ${paper.abstract.slice(0, 400)}${paper.abstract.length > 400 ? '…' : ''}`)
  })
  lines.push('Use scholar_download with a paper object or identifier to fetch the free full text; scholar_read to read it.')
  return [{ type: 'text', text: lines.join('\n') }]
}

/** Pending-call card. */
export function presentSearchCall(query: string): GenericCallView {
  return { card: 'generic', title: `Scholar search: ${query}`, kind: 'search', rawInput: query }
}

/**
 * Register `scholar_search`.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param runtime - plugin runtime.
 */
export function applySearchTool(ctx: Context, runtime: Runtime): void {
  ctx.tools.register(defineTool({
    name: 'scholar_search',
    description: `Search free scholarly indexes (${SEARCH_SOURCE_IDS.join(', ')}) in one call. Results are deduped across sources (DOI/arXiv/PMID/title), merged, and quality-ranked; each paper carries identifiers (doi/arxivId/pmid) and an openAccessPdfUrl when a free PDF is known. Prefer this over web_search for literature.`,
    parameters: {
      query: { type: 'string', required: true, description: 'Free-text search query (e.g. "attention is all you need").' },
      sources: { type: 'array', items: { type: 'string' }, description: `Subset of sources to query (default all enabled): ${SEARCH_SOURCE_IDS.join(', ')}.` },
      limit: { type: 'integer', description: 'Max merged results (default 20, max 50).' },
      yearFrom: { type: 'integer', description: 'Only papers published in or after this year.' },
      yearTo: { type: 'integer', description: 'Only papers published in or before this year.' },
    },
    output: {
      schema: SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderSearch(value as SearchValue),
    },
    timeoutMs: runtime.toolTimeoutMs,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentSearchCall(args.query),
    async execute(args, exec) {
      const query = args.query.trim()
      if (query.length === 0) throw new Error('query must be a non-empty string')
      const limit = Math.min(Math.max(1, Math.trunc(args.limit ?? 20)), 50)
      const enabled = runtime.enabledSources()
      const requested = args.sources?.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)
      const sources = runtime.registry.searchSources.filter((source) => {
        if (!enabled.includes(source.id)) return false
        // `sources` restricts the fan-out to a subset.
        return requested === undefined || requested.length === 0 || requested.includes(source.id)
      })
      const perSourceLimit = Math.max(limit, 10)
      const results = await Promise.allSettled(sources.map((source) => source.search({
        query,
        limit: perSourceLimit,
        ...(args.yearFrom !== undefined ? { yearFrom: Math.trunc(args.yearFrom) } : {}),
        ...(args.yearTo !== undefined ? { yearTo: Math.trunc(args.yearTo) } : {}),
      }, exec.signal)))
      const lists: PaperMeta[][] = []
      const failed: string[] = []
      results.forEach((result, index) => {
        const source = sources[index]
        if (source === undefined) return
        if (result.status === 'fulfilled') lists.push(result.value)
        else if (!(exec.signal.aborted)) failed.push(source.id)
      })
      if (exec.signal.aborted) exec.signal.throwIfAborted()
      const merged = mergeAndRank(lists, limit, new Date().getFullYear())
      const value: SearchValue = {
        query,
        total: merged.length,
        papers: merged.map(compactPaper),
        searchedSources: sources.map((s) => s.id),
        ...(failed.length > 0 ? { failedSources: failed } : {}),
      }
      return value
    },
  }))
}
