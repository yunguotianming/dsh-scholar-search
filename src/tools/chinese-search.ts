/**
 * CNKI、万方和维普的中文论文检索工具。
 * @module dsh-scholar-search/tools/chinese-search
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type GenericCallView } from '@deepseek-ai/dsh-tools'
import type { Runtime } from '../runtime.js'
import { ChineseBrowserWorkflow, providerFromUrl } from '../chinese/browser-workflow.js'
import type { PaperMeta } from '../types.js'

const PROVIDERS = ['cnki', 'wanfang', 'cqvip'] as const
type Provider = typeof PROVIDERS[number]

const PAPER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', required: true },
    authors: { type: 'array', items: { type: 'string' } },
    year: { type: 'integer' },
    venue: { type: 'string' },
    abstract: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    doi: { type: 'string' },
    landingPageUrl: { type: 'string' },
    source: { type: 'string', required: true },
    sourceId: { type: 'string', required: true },
  },
} as const

const SEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', required: true },
    total: { type: 'integer', required: true },
    papers: { type: 'array', required: true, items: PAPER_SCHEMA },
    searchedSources: { type: 'array', required: true, items: { type: 'string' } },
    failedSources: { type: 'array', items: { type: 'string' } },
    failureMessages: { type: 'array', items: { type: 'string' } },
  },
} as const

function present(title: string): GenericCallView {
  return { card: 'generic', title, kind: 'search', rawInput: title }
}

function renderSearch(value: ChineseSearchValue): { type: 'text'; text: string }[] {
  const lines = [`中文论文检索“${value.query}”：${value.total} 条结果，来源：${value.searchedSources.join('、')}`]
  for (const [index, paper] of value.papers.entries()) {
    lines.push(`${index + 1}. ${paper.title}${paper.year === undefined ? '' : `（${paper.year}）`}${paper.venue === undefined ? '' : ` — ${paper.venue}`}`)
    lines.push(`   来源：${paper.source}；详情：${paper.landingPageUrl ?? paper.sourceId}`)
    if (paper.authors !== undefined && paper.authors.length > 0) lines.push(`   作者：${paper.authors.join('、')}`)
    if (paper.keywords !== undefined && paper.keywords.length > 0) lines.push(`   关键词：${paper.keywords.join('、')}`)
    if (paper.abstract !== undefined) lines.push(`   摘要：${paper.abstract.slice(0, 400)}`)
  }
  if (value.failedSources.length > 0) lines.push(`失败来源：${value.failedSources.join('、')}`)
  if (value.failureMessages.length > 0) lines.push(`失败原因：${value.failureMessages.join('；')}`)
  return [{ type: 'text', text: lines.join('\n') }]
}

export interface ChineseSearchValue {
  query: string
  total: number
  papers: PaperMeta[]
  searchedSources: string[]
  failedSources: string[]
  failureMessages: string[]
}

function selectedProviders(value: unknown): Provider[] {
  if (!Array.isArray(value) || value.length === 0) return [...PROVIDERS]
  return value.filter((item): item is Provider => typeof item === 'string' && (PROVIDERS as readonly string[]).includes(item as Provider))
}

/** 注册中文三站点检索工具。 */
export function applyChineseSearchTools(ctx: Context, runtime: Runtime): void {
  const workflow = new ChineseBrowserWorkflow(ctx)
  ctx.tools.register(defineTool({
    name: 'chinese_scholar_search',
    description: 'Search Chinese papers on CNKI (cnki-mcp), Wanfang, and CQVIP. CNKI uses a managed cnki-mcp browser; Wanfang/CQVIP use the connected dsh-browser tab. Results are grouped by source and failures are reported separately.',
    parameters: {
      query: { type: 'string', required: true, description: 'Chinese paper search keywords.' },
      sources: { type: 'array', items: { type: 'string', enum: [...PROVIDERS] }, description: 'Subset of cnki, wanfang, cqvip; default all.' },
      limit: { type: 'integer', description: 'Maximum results per source (default 10, max 20).' },
    },
    output: { schema: SEARCH_SCHEMA, render: (_args, value) => renderSearch(value as ChineseSearchValue) },
    timeoutMs: runtime.toolTimeoutMs,
    isConcurrencySafe: () => false,
    presentCall: args => present(`中文论文检索：${(args as { query: string }).query}`),
    async execute(args, exec) {
      if (!runtime.chineseSearchEnabled()) throw new Error('Chinese paper search is disabled')
      const query = args.query.trim()
      if (query.length === 0) throw new Error('query must be a non-empty string')
      const limit = Math.min(Math.max(1, Math.trunc(args.limit ?? 10)), 20)
      const providers = selectedProviders(args.sources)
      const papers: PaperMeta[] = []
      const failedSources: string[] = []
      const failureMessages: string[] = []
      for (const provider of providers) {
        try {
          if (provider === 'cnki') {
            if (runtime.cnkiMcp === undefined) throw new Error('cnki-mcp is not configured')
            papers.push(...await runtime.cnkiMcp.search({ query, limit }, exec.signal))
          } else {
            papers.push(...await workflow.search(provider, query, limit, exec))
          }
        } catch (error) {
          if (!exec.signal.aborted) {
            failedSources.push(provider)
            failureMessages.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
      if (exec.signal.aborted) exec.signal.throwIfAborted()
      return { query, total: papers.length, papers, searchedSources: providers, failedSources, failureMessages }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'chinese_scholar_detail',
    description: 'Read metadata from a CNKI, Wanfang, or CQVIP paper detail URL. CNKI is delegated to cnki-mcp; Wanfang/CQVIP use dsh-browser.',
    parameters: { url: { type: 'string', required: true, description: 'Supported CNKI, Wanfang, or CQVIP detail URL.' } },
    output: { schema: PAPER_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    timeoutMs: runtime.toolTimeoutMs,
    presentCall: args => present(`读取中文论文：${(args as { url: string }).url}`),
    async execute(args, exec) {
      if (!runtime.chineseSearchEnabled()) throw new Error('Chinese paper search is disabled')
      const url = args.url.trim()
      const provider = providerFromUrl(url)
      if (provider !== undefined) return workflow.detail(provider, url, exec)
      if (!/^https:\/\/kns\.cnki\.net\/kcms2\/article\/abstract/i.test(url)) throw new Error('unsupported Chinese paper detail URL')
      if (runtime.cnkiMcp === undefined) throw new Error('cnki-mcp is not configured')
      const raw = await runtime.cnkiMcp.detail(url, exec.signal)
      const title = typeof raw.title === 'string' ? raw.title : url
      const paper: PaperMeta = { title, source: 'cnki_mcp', sourceId: url, landingPageUrl: url }
      if (Array.isArray(raw.authors)) paper.authors = raw.authors.filter((item): item is string => typeof item === 'string')
      if (typeof raw.journal === 'string') paper.venue = raw.journal
      if (typeof raw.abstract === 'string') paper.abstract = raw.abstract
      if (Array.isArray(raw.keywords)) paper.keywords = raw.keywords.filter((item): item is string => typeof item === 'string')
      if (typeof raw.doi === 'string') paper.doi = raw.doi
      const year = typeof raw.year === 'number' ? raw.year : undefined
      if (year !== undefined) paper.year = year
      return paper
    },
  }))
}
