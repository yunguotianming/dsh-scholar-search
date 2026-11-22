import { describe, expect, it, vi, afterEach } from 'vitest'
import { pdfUrlFromGrayAreaHtml, scihubResolvePdf, scihubPingMirror } from '../src/sources/grayarea.js'
import { DEFAULT_GRAYAREA_MIRRORS } from '../src/sources/grayarea.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { apply, Config } from '../src/index.js'
import { buildFallbackChain, downloadPaper } from '../src/download.js'
import { buildSources } from '../src/sources/index.js'
import { ScholarCardController } from '../src/client/controller.js'

const temporaryDirectories: string[] = []
const mirror = 'https://mirror.example/{doi}'
const pdfUrl = 'https://mirror.example/paper.pdf'
const paper = { title: '默认灰色渠道回归', doi: '10.1000/test', source: 'test', sourceId: 'test' }
const pdfBytes = new TextEncoder().encode('%PDF-1.7\n测试文件')

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(process.env.SCHOLAR_TEST_TEMP_DIR ?? tmpdir(), 'scholar-test-'))
  temporaryDirectories.push(directory)
  return directory
}

function fallbackRegistry() {
  const registry = buildSources({
    fetchOptions: () => ({ timeoutMs: 5000 }),
    semanticScholarApiKey: () => undefined,
    pubmedApiKey: () => undefined,
    coreApiKey: () => undefined,
    googleScholarApiKey: () => undefined,
    grayAreaMirrors: () => [mirror],
  })
  // OA 来源返回无候选，灰色渠道保留实际适配器与注册逻辑。
  registry.searchSources = []
  for (const id of ['unpaywall', 'openaire', 'crossref_page'] as const) {
    registry.linkSources[id] = { id, search: async () => [], resolvePdf: async () => undefined }
  }
  return registry
}

const SCIHUB_HTML_WITH_EMBED = `
<html>
<body>
<embed src="https://sci-hub.se/downloads/2020/01/01/paper.pdf" type="application/pdf">
</body>
</html>
`

const SCIHUB_HTML_WITH_IFRAME = `
<html>
<body>
<iframe src="https://sci-hub.se/tree/0a/0a1b2c3d.pdf"></iframe>
</body>
</html>
`

const SCIHUB_HTML_WITH_LOCATION = `
<html>
<body>
<script>location.href='https://sci-hub.se/downloads/paper.pdf';</script>
</body>
</html>
`

const SCIHUB_HTML_NO_PDF = `
<html>
<body>
<div>article not found</div>
</body>
</html>
`

afterEach(async () => {
  vi.unstubAllGlobals()
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe('灰色渠道默认可用', () => {
  it('无需启用配置即可在 OA 来源之后解析灰色渠道', async () => {
    const fetchMock = vi.fn(async () => new Response(`<embed src="${pdfUrl}">`))
    vi.stubGlobal('fetch', fetchMock)
    const chain = await buildFallbackChain(paper, fallbackRegistry(), new AbortController().signal)
    expect(chain.attempted.at(-1)).toBe('grayarea')
    expect(chain.levels).toEqual([{ label: 'grayarea', urls: [pdfUrl] }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('旧配置为 false 时直下工具仍能保存 PDF，配置表不再暴露开关', async () => {
    expect(Config.dict).not.toHaveProperty('allowGrayArea')
    const downloadDir = await temporaryDirectory()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === pdfUrl
      ? new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf' } })
      : new Response(`<embed src="${pdfUrl}">`)))
    const tools = new Map<string, any>()
    const ctx = {
      tools: { register: (tool: any) => { tools.set(tool.name, tool) } },
      systemPrompt: { section: vi.fn() }, effect: vi.fn(), inject: vi.fn(),
    } as unknown as Context
    const legacyConfig = { allowGrayArea: false, grayAreaMirrors: [mirror], downloadDir }
    apply(ctx, Config(legacyConfig))
    const tool = tools.get('scholar_scihub_download')!
    const result = await tool.execute({ doi: paper.doi, filename: '默认下载.pdf' }, { signal: new AbortController().signal })
    expect(result).toMatchObject({ mirror: 'mirror.example', sizeBytes: pdfBytes.length })
    expect(new Uint8Array(await readFile(result.path))).toEqual(pdfBytes)
  })

  it('OA 下载命中后停止回退，不访问灰色镜像', async () => {
    const oaUrl = 'https://oa.example/paper.pdf'
    const fetchMock = vi.fn(async (_url: string) => new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf' } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await downloadPaper({ ...paper, openAccessPdfUrl: oaUrl }, {
      registry: fallbackRegistry(), downloadDir: await temporaryDirectory(),
      fetchOptions: () => ({ timeoutMs: 5000 }), pdfTimeoutMs: 5000,
    }, new AbortController().signal)
    expect(result).toMatchObject({ source: 'direct', url: oaUrl })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(oaUrl)
  })

  it('旧开关不进入卡片状态，文本配置仍可保存', async () => {
    const set = vi.fn(async (_field: string, _value: unknown) => {})
    const controller = new ScholarCardController({
      getSnapshot: () => ({ value: { allowGrayArea: false, email: 'old@example.com' } }),
      subscribe: () => () => {}, set,
    })
    expect(controller.store.getSnapshot()).not.toHaveProperty('allowGrayArea')
    controller.editField('email', ' new@example.com ')
    await controller.saveField('email')
    expect(set).toHaveBeenCalledWith('email', 'new@example.com')
    expect(controller.store.getSnapshot().notices.email).toEqual({ kind: 'saved' })
  })
})

describe('pdfUrlFromGrayAreaHtml', () => {
  it('extracts PDF from embed tag', () => {
    const url = pdfUrlFromGrayAreaHtml(SCIHUB_HTML_WITH_EMBED, 'https://sci-hub.se/10.1038/nature12373')
    expect(url).toBe('https://sci-hub.se/downloads/2020/01/01/paper.pdf')
  })

  it('extracts PDF from iframe tag', () => {
    const url = pdfUrlFromGrayAreaHtml(SCIHUB_HTML_WITH_IFRAME, 'https://sci-hub.se/10.1038/nature12373')
    expect(url).toBe('https://sci-hub.se/tree/0a/0a1b2c3d.pdf')
  })

  it('extracts PDF from location.href', () => {
    const url = pdfUrlFromGrayAreaHtml(SCIHUB_HTML_WITH_LOCATION, 'https://sci-hub.se/10.1038/nature12373')
    expect(url).toBe('https://sci-hub.se/downloads/paper.pdf')
  })

  it('returns undefined when no PDF link exists', () => {
    expect(pdfUrlFromGrayAreaHtml(SCIHUB_HTML_NO_PDF, 'https://sci-hub.se/10.1038/nature12373')).toBeUndefined()
  })

  it('resolves relative URLs against the base', () => {
    const html = '<embed src="/downloads/paper.pdf">'
    const url = pdfUrlFromGrayAreaHtml(html, 'https://sci-hub.se/10.1038/nature12373')
    expect(url).toBe('https://sci-hub.se/downloads/paper.pdf')
  })
})

describe('scihubResolvePdf', () => {
  it('returns the first PDF URL found across mirrors', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('sci-hub.se')) {
        return new Response(SCIHUB_HTML_WITH_EMBED, { status: 200 })
      }
      return new Response(SCIHUB_HTML_NO_PDF, { status: 200 })
    }))
    const result = await scihubResolvePdf('10.1038/nature12373', DEFAULT_GRAYAREA_MIRRORS, { timeoutMs: 5000 })
    expect(result.pdfUrl).toBe('https://sci-hub.se/downloads/2020/01/01/paper.pdf')
    expect(result.probes.length).toBeGreaterThan(0)
    expect(result.probes[0]!.host).toBe('sci-hub.se')
    expect(result.probes[0]!.ok).toBe(true)
  })

  it('returns undefined when no mirror has the paper', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SCIHUB_HTML_NO_PDF, { status: 200 })))
    const result = await scihubResolvePdf('10.9999/nonexistent', DEFAULT_GRAYAREA_MIRRORS, { timeoutMs: 5000 })
    expect(result.pdfUrl).toBeUndefined()
    expect(result.probes.length).toBe(DEFAULT_GRAYAREA_MIRRORS.length)
    for (const probe of result.probes) {
      expect(probe.ok).toBe(false)
    }
  })

  it('respects custom mirror list', async () => {
    const customMirrors = ['https://custom.mirror/{doi}']
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SCIHUB_HTML_WITH_EMBED, { status: 200 })))
    const result = await scihubResolvePdf('10.1038/nature12373', customMirrors, { timeoutMs: 5000 })
    expect(result.probes.length).toBe(1)
    expect(result.probes[0]!.host).toBe('custom.mirror')
  })
})

describe('scihubPingMirror', () => {
  it('returns ok with latency when mirror responds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))
    const result = await scihubPingMirror('https://sci-hub.se/{doi}', { timeoutMs: 5000 })
    expect(result.ok).toBe(true)
    expect(result.host).toBe('sci-hub.se')
    expect(result.latencyMs).toBeDefined()
  })

  it('returns error when mirror is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const result = await scihubPingMirror('https://sci-hub.se/{doi}', { timeoutMs: 5000 })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ECONNREFUSED')
  })

  it('returns error for bad URL', async () => {
    const result = await scihubPingMirror('not-a-url', { timeoutMs: 5000 })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('bad-url')
  })
})
