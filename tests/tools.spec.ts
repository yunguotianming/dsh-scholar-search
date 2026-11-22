import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Runtime } from '../src/runtime.js'
import type { PaperMeta } from '../src/types.js'
import { downloadPaper } from '../src/download.js'
import { applyDownloadTool, renderDownload } from '../src/tools/download.js'
import { applySearchTool, renderSearch } from '../src/tools/search.js'

vi.mock('../src/download.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/download.js')>(), downloadPaper: vi.fn(),
}))

afterEach(() => vi.mocked(downloadPaper).mockReset())

function runtime(): Runtime {
  return {
    registry: { searchSources: [], linkSources: {} },
    enabledSources: () => ['semantic_scholar', 'pubmed'],
    resolveDownloadDir: vi.fn((_exec, override) => resolve(override ?? 'download/papers')),
    toolTimeoutMs: 30_000, pdfTimeoutMs: 60_000,
  } as unknown as Runtime
}

function registeredTool(apply: (ctx: Context, runtime: Runtime) => void, value: Runtime) {
  // 只替换注册容器，实际 defineTool 和执行函数使用生产实现。
  let tool: any
  apply({ tools: { register: (definition: unknown) => { tool = definition } } } as unknown as Context, value)
  return tool
}

const input: PaperMeta = { title: '科研护士', source: 'semantic_scholar', sourceId: 's2-a', doi: '10.1000/a' }
const exec = () => ({ signal: new AbortController().signal })

describe('工具参数与批量统计回归', () => {
  it('批量文本保留落盘路径，并按实际原因给出待补齐清单', () => {
    const text = renderDownload({
      results: [
        { paper: input, download: { error: 'no-free-fulltext', triedSources: ['unpaywall'], failureKind: 'candidates-failed', attempts: [{ source: 'unpaywall', reason: 'http-403', status: 403 }], manualLinks: ['https://repository.example/article'] } },
        { paper: { ...input, title: 'Saved study' }, download: { path: 'saved.pdf', source: 'direct', url: 'https://repository.example/saved.pdf', sizeBytes: 100, pdfVerification: 'unverified' } },
      ],
      summary: { requested: 2, unique: 2, downloaded: 1, failed: 1, skipped: 0 },
    })[0]!.text
    expect(text).toContain('saved.pdf（PDF 待核验）')
    expect(text).toContain(`${input.title}（DOI ${input.doi}） [http-403] https://repository.example/article`)
  })

  it('逐次下载目录传给运行时，批量结果按真实结果去重计数', async () => {
    const value = runtime()
    const tool = registeredTool(applyDownloadTool, value)
    vi.mocked(downloadPaper)
      .mockResolvedValueOnce({ path: 'a.pdf', source: 'europe_pmc', url: 'https://repo.example/a.pdf', sizeBytes: 10 })
      .mockResolvedValueOnce({ error: 'no-free-fulltext', triedSources: ['direct'], failureKind: 'candidates-failed' })
    const result = await tool.execute({ papers: [input, { ...input, sourceId: 's2-b' }, { ...input, doi: '10.1000/b', title: '第二篇' }], downloadDir: '20261012新增' }, exec())
    expect(result.summary).toEqual({ requested: 3, unique: 2, downloaded: 1, failed: 1, skipped: 0 })
    expect(result.results).toHaveLength(2)
    expect(value.resolveDownloadDir).toHaveBeenCalledWith(expect.anything(), '20261012新增')
    expect(downloadPaper).toHaveBeenCalledTimes(2)
  })

  it('目录故障停止后续网络下载并使批量计数保持一致', async () => {
    const tool = registeredTool(applyDownloadTool, runtime())
    vi.mocked(downloadPaper).mockResolvedValue({ error: 'write-error', triedSources: [], message: '无法写入' })
    const result = await tool.execute({ papers: [input, { ...input, doi: '10.1000/b', title: '另一篇' }] }, exec())
    expect(result.summary).toEqual({ requested: 2, unique: 2, downloaded: 0, failed: 1, skipped: 1 })
    expect(result.results[1].download.error).toBe('not-attempted')
    expect(downloadPaper).toHaveBeenCalledTimes(1)
  })

  it('拒绝互斥参数和批量同名覆盖', async () => {
    const tool = registeredTool(applyDownloadTool, runtime())
    await expect(tool.execute({ identifier: '10.1000/a', paper: input }, exec())).rejects.toThrow('只能提供一项')
    await expect(tool.execute({ papers: [input], filename: 'same.pdf' }, exec())).rejects.toThrow('filename')
    await expect(tool.execute({ papers: [] }, exec())).rejects.toThrow('1–50')
    expect(downloadPaper).not.toHaveBeenCalled()
  })

  it('时间预算用尽时保留已完成条目，不把未尝试项算失败', async () => {
    const value = runtime()
    value.toolTimeoutMs = 1000
    value.pdfTimeoutMs = 30
    const tool = registeredTool(applyDownloadTool, value)
    vi.mocked(downloadPaper).mockResolvedValueOnce({ path: 'a.pdf', source: 'direct', url: 'https://repo.example/a.pdf', sizeBytes: 10 })
      .mockImplementationOnce(async (_paper, _options, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }))
    const result = await tool.execute({ papers: [input, { ...input, title: '第二篇', doi: '10.1000/b' }, { ...input, title: '第三篇', doi: '10.1000/c' }] }, exec())
    expect(result.summary).toEqual({ requested: 3, unique: 3, downloaded: 1, failed: 1, skipped: 1 })
    expect(result.results[1].download.error).toBe('timeout')
  })

  it('连字符别名命中正确检索源，未知或未启用源明确报错', async () => {
    const value = runtime()
    const search = vi.fn(async () => [input])
    value.registry.searchSources = [{ id: 'semantic_scholar', search }]
    const tool = registeredTool(applySearchTool, value)
    expect(await tool.execute({ query: 'nursing research', sources: ['semantic-scholar'] }, exec())).toMatchObject({ total: 1, searchedSources: ['semantic_scholar'] })
    expect(search).toHaveBeenCalledTimes(1)
    await expect(tool.execute({ query: 'nursing', sources: ['unknown'] }, exec())).rejects.toThrow('未知检索源')
    await expect(tool.execute({ query: 'nursing', sources: ['arxiv'] }, exec())).rejects.toThrow('均未启用')
  })

  it('摘要展示完整原文，著录年和卷期页码可见', () => {
    const abstract = 'A'.repeat(600) + ' role clarity and final finding.'
    const rendered = renderSearch({ query: 'nursing', total: 1, papers: [{ ...input, abstract, year: 2022, printYear: 2022, onlineYear: 2021, volume: '31', pages: '3414-3427' }], searchedSources: ['crossref'] })[0]!.text
    expect(rendered).toContain(abstract)
    expect(rendered).toContain('3414-3427')
    expect(rendered).toContain('卷期年：2022')
  })
})
