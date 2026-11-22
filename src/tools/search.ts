/**
 * `scholar_search` — federated free-literature search: fan out to the enabled
 * sources in parallel, dedupe + merge + quality-rank, return PaperMeta[].
 * @module dsh-scholar-search/tools/search
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type { Runtime } from '../runtime.js'
import { SEARCH_SOURCE_IDS } from '../sources/index.js'
import { searchPapers } from '../search.js'
import type { SearchValue } from '../search.js'

export { compactPaper } from '../search.js'
export type { SearchValue } from '../search.js'

/** Output schema of one paper in the result list. */
export const PAPER_META_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', required: true },
    authors: { type: 'array', items: { type: 'string' } },
    year: { type: 'integer' },
    printYear: { type: 'integer' },
    onlineYear: { type: 'integer' },
    volume: { type: 'string' },
    issue: { type: 'string' },
    pages: { type: 'string' },
    articleNumber: { type: 'string' },
    venue: { type: 'string' },
    abstract: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    doi: { type: 'string' },
    arxivId: { type: 'string' },
    pmid: { type: 'string' },
    pmcid: { type: 'string' },
    citationCount: { type: 'integer' },
    isOpenAccess: { type: 'boolean' },
    openAccessPdfUrl: { type: 'string' },
    landingPageUrl: { type: 'string' },
    siteDownloadUrl: { type: 'string' },
    publishDate: { type: 'string' },
    onlinePublishDate: { type: 'string' },
    organizations: { type: 'array', items: { type: 'string' } },
    funds: { type: 'array', items: { type: 'string' } },
    classifications: { type: 'array', items: { type: 'string' } },
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
    if (paper.authors !== undefined) lines.push(`   作者：${paper.authors.join('; ')}`)
    const bibliography = [paper.volume, paper.issue !== undefined ? `(${paper.issue})` : undefined, paper.pages, paper.articleNumber]
      .filter((value) => value !== undefined).join(' · ')
    if (bibliography.length > 0) lines.push(`   卷期页码/文章号：${bibliography}`)
    if (paper.onlineYear !== undefined) lines.push(`   在线年：${paper.onlineYear}${paper.printYear !== undefined ? `；卷期年：${paper.printYear}` : ''}`)
    if (paper.openAccessPdfUrl !== undefined) lines.push(`   OA PDF: ${paper.openAccessPdfUrl}`)
    if (paper.abstract !== undefined) lines.push(`   摘要（来源提供的原文，完整性需核对）：${paper.abstract}`)
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
      sources: { type: 'array', items: { type: 'string' }, description: `检索源子集，默认全部已启用源；支持连字符别名。${SEARCH_SOURCE_IDS.join(', ')}。DOI 著录核对用 query=DOI、sources=["crossref"] 精确回解。` },
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
      return searchPapers(args, runtime, exec.signal)
    },
  }))
}
