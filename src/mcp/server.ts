import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/server'
import type { CallToolResult, Implementation } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { chineseSourceFromUrl } from '../chinese/browser-workflow.js'
import { CNKI_MCP_DEFAULTS, readCnkiPaper } from '../chinese/cnki-mcp.js'
import type { CnkiMcpManager } from '../chinese/cnki-mcp.js'
import type { ChineseFileDownloader } from '../chinese/file-download.js'
import { buildFallbackChain, paperLandingLinks } from '../download.js'
import { normalizeDoi } from '../http.js'
import { paperFromIdentifier } from '../paper.js'
import { searchPapers } from '../search.js'
import type { SearchRuntime } from '../search.js'

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }

function toolResult(value: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  }
}

export function createScholarMcp(
  runtime: SearchRuntime & { toolTimeoutMs: number; cnkiMcp?: CnkiMcpManager; chineseDownloader?: Pick<ChineseFileDownloader, 'download'> },
  info: Pick<Implementation, 'name' | 'version'>,
): McpServer {
  const server = new McpServer(info, { capabilities: { tools: {} } })
  const requestSignal = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(runtime.toolTimeoutMs)])

  server.registerTool('scholar_search', {
    description: '跨多个公开学术索引检索文献，合并重复题录并排序。返回题名、作者、摘要、DOI 及已知全文候选地址。',
    inputSchema: z.strictObject({
      query: z.string().trim().min(1).describe('检索词或检索式'),
      sources: z.array(z.string()).optional().describe('检索源子集，例如 crossref、pubmed、openalex'),
      limit: z.number().int().min(1).max(50).optional().describe('返回条数，默认 20'),
      yearFrom: z.number().int().optional(),
      yearTo: z.number().int().optional(),
    }),
    annotations,
  }, async (args, ctx) => toolResult({ ...await searchPapers(args, runtime, requestSignal(ctx.mcpReq.signal)) }))

  server.registerTool('scholar_lookup_doi', {
    description: '通过 Crossref 的精确 DOI 记录查询题录。返回题名、作者、出版年份和卷期页码等可用字段。',
    inputSchema: z.strictObject({ doi: z.string().trim().min(1).describe('DOI 或 doi.org 链接') }),
    annotations,
  }, async ({ doi: input }, ctx) => {
    const doi = normalizeDoi(input)
    if (doi === undefined) throw new Error('请输入有效的 DOI 或 doi.org 链接')
    const crossref = runtime.registry.searchSources.find((source) => source.id === 'crossref')
    if (crossref === undefined) throw new Error('Crossref 来源不可用')
    const signal = requestSignal(ctx.mcpReq.signal)
    const records = await crossref.search({ query: doi, limit: 1 }, signal)
    signal.throwIfAborted()
    const paper = records.find((record) => normalizeDoi(record.doi) === doi)
    return toolResult(paper === undefined ? { doi, status: 'not-resolved' } : { doi, status: 'found', paper })
  })

  server.registerTool('scholar_locate_open_access', {
    description: '按 DOI、arXiv ID 或 PMID 定位开放全文候选。返回来源、候选 PDF 地址和文章页，链接的访问状态需另行确认。',
    inputSchema: z.strictObject({ identifier: z.string().trim().min(1).describe('DOI、arXiv ID 或 PMID') }),
    annotations,
  }, async ({ identifier }, ctx) => {
    const paper = paperFromIdentifier(identifier)
    const { levels, attempted } = await buildFallbackChain(
      paper, runtime.registry, requestSignal(ctx.mcpReq.signal), { openAccessOnly: true },
    )
    const locations = levels.map(({ label, urls, landingUrls }) => ({
      source: label, pdfUrls: urls, landingUrls: landingUrls ?? [],
    }))
    return toolResult({ identifier, locations, attempted, articleLinks: paperLandingLinks(paper) })
  })

  const cnki = runtime.cnkiMcp
  if (cnki !== undefined) {
    const cnkiSignal = (signal: AbortSignal) =>
      AbortSignal.any([signal, AbortSignal.timeout(runtime.toolTimeoutMs + CNKI_MCP_DEFAULTS.startupTimeoutMs)])

    server.registerTool('chinese_scholar_search', {
      description: '用内置 cnki-mcp 在中国知网检索中文文献。返回题名、作者、期刊和可供详情查询的页面地址。',
      inputSchema: z.strictObject({
        query: z.string().trim().min(1).describe('中文检索词'),
        sources: z.array(z.literal('cnki')).max(1).optional().describe('独立 MCP 支持知网'),
        limit: z.number().int().min(1).max(20).optional().describe('返回条数，默认 10'),
      }),
      annotations,
    }, async ({ query, limit }, ctx) => {
      const papers = await cnki.search({ query, limit: limit ?? 10 }, cnkiSignal(ctx.mcpReq.signal))
      return toolResult({ query, total: papers.length, papers, searchedSources: ['cnki'] })
    })

    server.registerTool('chinese_scholar_detail', {
      description: '读取知网检索结果的详情题录，包括可用的 DOI、作者、期刊、摘要、关键词和机构。',
      inputSchema: z.strictObject({ url: z.url().describe('知网检索返回的 landingPageUrl') }),
      annotations,
    }, async ({ url }, ctx) => toolResult({ ...await readCnkiPaper(cnki, url, cnkiSignal(ctx.mcpReq.signal)) }))
  }

  const downloader = runtime.chineseDownloader
  if (downloader !== undefined) {
    const pending = new Map<string, { requestKey: string; expiresAt: number }>()
    server.registerTool('chinese_scholar_download', {
      description: '下载知网、万方或维普全文。首次调用返回待确认目录及编号。必须向用户展示返回的文献和绝对目录，等待用户明确同意后，才可带该编号用相同参数再次调用。成功时返回文件的本机绝对路径。',
      inputSchema: z.strictObject({
        url: z.url().describe('文献详情页 HTTPS 地址，可用检索结果的 landingPageUrl'),
        downloadDir: z.string().trim().min(1).describe('运行 MCP 的机器上的拟保存绝对目录'),
        confirmationId: z.string().uuid().optional().describe('仅在用户明确同意本次目录后填写，由首次调用返回'),
        title: z.string().trim().min(1).optional().describe('预期文献题名，用于核对 PDF'),
        doi: z.string().trim().min(1).optional().describe('预期 DOI，用于核对 PDF'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async ({ confirmationId, downloadDir, url, title, doi }, ctx) => {
      if (chineseSourceFromUrl(url) === undefined) throw new Error('请输入知网、万方或维普的 HTTPS 论文详情页链接')
      if (!isAbsolute(downloadDir)) throw new Error('downloadDir 必须是运行 MCP 的机器上的绝对路径')
      ctx.mcpReq.signal.throwIfAborted()
      const request = { url, downloadDir: resolve(downloadDir), title, doi }
      const requestKey = JSON.stringify(request)
      const now = Date.now()
      for (const [id, confirmation] of pending) {
        if (confirmation.expiresAt <= now) pending.delete(id)
      }
      if (confirmationId !== undefined && pending.get(confirmationId)?.requestKey === requestKey) {
        pending.delete(confirmationId)
        return toolResult({ ...await downloader.download(
          request, AbortSignal.any([ctx.mcpReq.signal, AbortSignal.timeout(60_000)]),
        ) })
      }
      if (confirmationId !== undefined) pending.delete(confirmationId)
      if (pending.size >= 32) pending.delete(pending.keys().next().value!)
      const id = randomUUID()
      pending.set(id, { requestKey, expiresAt: now + 5 * 60_000 })
      return toolResult({
        status: 'confirmation-required', confirmationId: id, detailUrl: url, downloadDir: request.downloadDir,
        ...(title !== undefined ? { title } : {}),
        message: `请向用户确认是否将「${title ?? url}」下载到 ${request.downloadDir}。明确同意后，再用相同参数和本次确认编号调用。`,
      })
    })
  }

  return server
}
