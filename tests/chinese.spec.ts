import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { CNKI_MCP_DEFAULTS, CnkiMcpManager, readCnkiPaper } from '../src/chinese/cnki-mcp.js'
import {
  ChineseBrowserWorkflow,
  chineseSourceFromUrl,
  cleanDoi,
  formatOfDownload,
  isDetailUrl,
  parseAuthors,
  parseDownloadCandidates,
  parseLabelRows,
  parseSnapshot,
  providerFromUrl,
  resolveHref,
  splitList,
} from '../src/chinese/browser-workflow.js'
import { applyChineseSearchTools } from '../src/tools/chinese-search.js'
import type { Runtime } from '../src/runtime.js'

afterEach(() => vi.unstubAllGlobals())

const exec = (): ToolRunContext => ({
  callId: 'c1',
  rootCallId: 'r1',
  token: 't1',
  signal: new AbortController().signal,
} as unknown as ToolRunContext)

/** 按顺序回放 dsh-browser 的文本结果；记录实际调用的工具名。 */
function fakeWorkflow(responses: Array<string | Error>): { workflow: ChineseBrowserWorkflow; calls: string[] } {
  const queue = [...responses]
  const calls: string[] = []
  const ctx = {
    tools: {
      get: () => ({}),
      execute: async (input: { name: string }) => {
        calls.push(input.name)
        const next = queue.shift()
        if (next instanceof Error) return { isError: true, content: [{ type: 'text', text: next.message }] }
        return { isError: false, content: [{ type: 'text', text: next ?? '' }] }
      },
    },
  } as unknown as Context
  return { workflow: new ChineseBrowserWorkflow(ctx), calls }
}

const WANFANG_DETAIL = `Title: 论文详情
URL: https://d.wanfangdata.com.cn/periodical/abc
Status: complete

Main content:
生态文明的测量 张三 李四
摘要 关键词 文献发表日期

Interactive elements:
  [1] link "返回检索" → d.wanfangdata.com.cn/paper?q=x
  [2] link "下载" → d.wanfangdata.com.cn/periodical/abc/download
  [3] link "导出参考文献" → d.wanfangdata.com.cn/periodical/abc/export
`

const WANFANG_ROWS = `摘要：本文讨论生态文明的测量方法，并给出可复核的指标。
关键词：生态文明;测量;指标体系
文献发表日期：2024-05-01
在线出版日期：2024-06-10
机构：清华大学;北京大学
分类号：TP391;F205
资助基金：国家自然科学基金(123456)
页数：8页 12-19`

describe('browser snapshot parsing', () => {
  it('extracts page identity, main text, roles, and detail links', () => {
    const snapshot = parseSnapshot(`Title: 万方检索\nURL: https://s.wanfangdata.com.cn/paper?q=x\nStatus: complete\n\nMain content:\n共找到 2 条结果\n\nInteractive elements:\n  [1] link "论文一" → d.wanfangdata.com.cn/periodical/abc\n  [2] link "无关链接" → /about\n  [3] button "查看全部" [disabled]\n`)
    expect(snapshot.title).toBe('万方检索')
    expect(snapshot.main).toContain('共找到 2 条结果')
    expect(snapshot.items).toEqual([
      { index: 1, role: 'link', name: '论文一', href: 'd.wanfangdata.com.cn/periodical/abc' },
      { index: 2, role: 'link', name: '无关链接', href: '/about' },
      { index: 3, role: 'button', name: '查看全部' },
    ])
  })

  it('normalizes site-relative and headline links', () => {
    expect(resolveHref('/doc/1', 'https://www.cqvip.com/search?k=x')).toBe('https://www.cqvip.com/doc/1')
    expect(resolveHref('d.wanfangdata.com.cn/periodical/1', 'https://s.wanfangdata.com.cn')).toBe('https://d.wanfangdata.com.cn/periodical/1')
    expect(isDetailUrl('wanfang', 'https://d.wanfangdata.com.cn/periodical/1')).toBe(true)
    expect(isDetailUrl('cqvip', 'https://www.cqvip.com/doc/1')).toBe(true)
    expect(providerFromUrl('https://www.cqvip.com/doc/1')).toBe('cqvip')
  })
})

describe('中文详情字段解析', () => {
  it('按标签切分详情字段，标签独立成行时取下一行', () => {
    const rows = parseLabelRows(`分类号：TP391\n摘要：\n本文给出可复核的指标。\n关键词：生态文明;测量`, ['摘要', '关键词', '分类号'])
    expect(rows['分类号']).toBe('TP391')
    expect(rows['摘要']).toBe('本文给出可复核的指标。')
    expect(rows['关键词']).toBe('生态文明;测量')
    expect(parseLabelRows(WANFANG_ROWS, ['文献发表日期', '机构', '页数'])['机构']).toBe('清华大学;北京大学')
  })

  it('规范化作者、列表与 DOI', () => {
    expect(parseAuthors('张三 李四 王五')).toEqual(['张三', '李四', '王五'])
    expect(parseAuthors('张三;李四')).toEqual(['张三', '李四'])
    expect(parseAuthors(undefined)).toEqual([])
    expect(splitList('TP391;F205')).toEqual(['TP391', 'F205'])
    expect(cleanDoi('DOI: 10.1234/abcd.5')).toBe('10.1234/abcd.5')
    expect(cleanDoi('https://doi.org/10.1234/abcd')).toBe('10.1234/abcd')
    expect(cleanDoi('无')).toBeUndefined()
  })

  it('只把三个站点的详情页当作入口', () => {
    expect(chineseSourceFromUrl('https://kns.cnki.net/kcms2/article/abstract?v=1')).toBe('cnki')
    expect(chineseSourceFromUrl('https://d.wanfangdata.com.cn/periodical/abc')).toBe('wanfang')
    expect(chineseSourceFromUrl('https://www.cqvip.com/doc/1')).toBe('cqvip')
    expect(chineseSourceFromUrl('https://kns.cnki.net/kns8s/defaultresult/index?kw=x')).toBeUndefined()
    expect(providerFromUrl('https://kns.cnki.net/kcms2/article/abstract?v=1')).toBeUndefined()
  })
})

describe('站点下载入口解析', () => {
  it('挑出站点下载链接，排除导航链接与详情页自身', () => {
    const snapshot = parseSnapshot(WANFANG_DETAIL)
    expect(parseDownloadCandidates('wanfang', snapshot, 'https://d.wanfangdata.com.cn/periodical/abc'))
      .toEqual([expect.objectContaining({ url: 'https://d.wanfangdata.com.cn/periodical/abc/download', format: 'other' })])
  })

  it('拒绝站外域名和详情页自身', () => {
    const snapshot = parseSnapshot(`URL: https://d.wanfangdata.com.cn/periodical/abc
Interactive elements:
  [1] link "下载" → evil.example.com/download.pdf
  [2] link "PDF下载" → d.wanfangdata.com.cn/periodical/abc
  [3] link "PDF下载" → kns.cnki.net/kcms2/article/download?v=1
`)
    expect(parseDownloadCandidates('wanfang', snapshot, 'https://d.wanfangdata.com.cn/periodical/abc')).toEqual([])
    expect(parseDownloadCandidates('cnki', snapshot, 'https://kns.cnki.net/kcms2/article/abstract?v=1'))
      .toEqual([expect.objectContaining({ url: 'https://kns.cnki.net/kcms2/article/download?v=1', format: 'pdf' })])
  })

  it('识别 PDF、CAJ、阅读页与其他下载入口', () => {
    expect(formatOfDownload('PDF下载', 'https://kns.cnki.net/kcms2/article/download?v=1')).toBe('pdf')
    expect(formatOfDownload('CAJ下载', 'https://kns.cnki.net/kcms2/article/download?v=1')).toBe('caj')
    expect(formatOfDownload('', 'https://kns.cnki.net/kcms2/article/btn-dlcaj?v=1')).toBe('caj')
    expect(formatOfDownload('HTML阅读', 'https://kns.cnki.net/kcms2/article/read?v=1')).toBe('reader')
    expect(formatOfDownload('原版阅读', 'https://kns.cnki.net/kcms2/article/read2?v=1')).toBe('reader')
    expect(formatOfDownload('下载', 'https://d.wanfangdata.com.cn/periodical/abc/download')).toBe('other')
    expect(formatOfDownload('返回检索', 'https://d.wanfangdata.com.cn/paper?q=x')).toBeUndefined()
  })

  it('同时存在 PDF 与 CAJ 时 PDF 优先，阅读页不进入候选', () => {
    const snapshot = parseSnapshot(`URL: https://kns.cnki.net/kcms2/article/abstract?v=1
Interactive elements:
  [1] link "CAJ下载" → kns.cnki.net/kcms2/article/btn-dlcaj?v=1
  [2] link "PDF下载" → kns.cnki.net/kcms2/article/btn-dlpdf?v=1
  [3] link "HTML阅读" → kns.cnki.net/kcms2/article/read?v=1
`)
    const candidates = parseDownloadCandidates('cnki', snapshot, 'https://kns.cnki.net/kcms2/article/abstract?v=1')
    expect(candidates.map(candidate => candidate.format)).toEqual(['pdf', 'caj'])
    expect(candidates[0]!.url).toContain('btn-dlpdf')
  })

  it('详情页顺带带上 siteDownloadUrl，并解析出完整字段', async () => {
    const { workflow, calls } = fakeWorkflow(['opened', 'waited', WANFANG_DETAIL, '生态文明的测量', '张三 李四', WANFANG_ROWS])
    const paper = await workflow.detail('wanfang', 'https://d.wanfangdata.com.cn/periodical/abc', exec())
    expect(paper.title).toBe('生态文明的测量')
    expect(paper.authors).toEqual(['张三', '李四'])
    expect(paper.doi).toBeUndefined()
    expect(paper.publishDate).toBe('2024-05-01')
    expect(paper.onlinePublishDate).toBe('2024-06-10')
    expect(paper.organizations).toEqual(['清华大学', '北京大学'])
    expect(paper.funds).toEqual(['国家自然科学基金(123456)'])
    expect(paper.classifications).toEqual(['TP391', 'F205'])
    expect(paper.pages).toBe('12-19')
    expect(paper.year).toBe(2024)
    expect(paper.siteDownloadUrl).toBe('https://d.wanfangdata.com.cn/periodical/abc/download')
    expect(calls).toEqual(['browser_open_tab', 'browser_wait', 'browser_snapshot', 'browser_get_text', 'browser_get_text', 'browser_get_text'])
  })
})

describe('中文下载工具', () => {
  it('解析入口后在受控浏览器打开，并回传状态', async () => {
    const { workflow, calls } = fakeWorkflow(['opened', 'waited', WANFANG_DETAIL, 'opened download'])
    const result = await workflow.download('wanfang', 'https://d.wanfangdata.com.cn/periodical/abc', exec(), { open: true })
    expect(result.status).toBe('opened')
    expect(result.opened).toBe(true)
    expect(result.downloadUrl).toBe('https://d.wanfangdata.com.cn/periodical/abc/download')
    expect(result.title).toBe('论文详情')
    expect(calls).toEqual(['browser_open_tab', 'browser_wait', 'browser_snapshot', 'browser_open_tab'])
  })

  it('open=false 只解析不打开', async () => {
    const { workflow, calls } = fakeWorkflow(['opened', 'waited', WANFANG_DETAIL])
    const result = await workflow.download('wanfang', 'https://d.wanfangdata.com.cn/periodical/abc', exec(), { open: false })
    expect(result).toMatchObject({ status: 'link-resolved', opened: false })
    // 只打开了详情页，没有再去打开下载入口。
    expect(calls.filter(name => name === 'browser_open_tab')).toHaveLength(1)
  })

  it('页面没有入口时返回 no-download-link，并说明缺哪一步', async () => {
    const empty = 'Title: 无下载区\nURL: https://d.wanfangdata.com.cn/periodical/abc\nInteractive elements:\n'
    const { workflow } = fakeWorkflow(['opened', 'waited', empty, empty, empty])
    const result = await workflow.download('wanfang', 'https://d.wanfangdata.com.cn/periodical/abc', exec(), { open: true })
    expect(result.status).toBe('no-download-link')
    expect(result.opened).toBe(false)
    expect(result.message).toContain('机构订阅')
  })

  it('验证码页面回传 captcha 状态而不是抛错', async () => {
    const captcha = 'Title: 安全验证\nURL: https://kns.cnki.net/kcms2/article/abstract?v=1\nMain content:\n请完成验证\n'
    const { workflow, calls } = fakeWorkflow(['opened', 'waited', captcha])
    const result = await workflow.download('cnki', 'https://kns.cnki.net/kcms2/article/abstract?v=1', exec(), { open: true })
    expect(result.status).toBe('captcha')
    expect(calls).toEqual(['browser_open_tab', 'browser_wait', 'browser_snapshot'])
  })

  it('只有 CAJ 时如实标记 caj-only，不冒充 PDF', async () => {
    const cajOnly = `URL: https://kns.cnki.net/kcms2/article/abstract?v=1
Interactive elements:
  [1] link "CAJ下载" → kns.cnki.net/kcms2/article/btn-dlcaj?v=1
`
    const resolved = await fakeWorkflow(['opened', 'waited', cajOnly]).workflow
      .download('cnki', 'https://kns.cnki.net/kcms2/article/abstract?v=1', exec(), { open: false })
    expect(resolved).toMatchObject({ status: 'caj-only', format: 'caj', opened: false })
    expect(resolved.message).toContain('专用阅读器')

    const opened = await fakeWorkflow(['opened', 'waited', cajOnly, 'opened caj']).workflow
      .download('cnki', 'https://kns.cnki.net/kcms2/article/abstract?v=1', exec(), { open: true })
    expect(opened).toMatchObject({ status: 'caj-only', format: 'caj', opened: true })
    expect(opened.message).toContain('不等于下载完成')
  })

  it('工具层默认只解析，open=true 才打开', async () => {
    const registered: Record<string, { execute: (args: Record<string, unknown>, exec: unknown) => Promise<unknown> }> = {}
    const queue = ['opened', 'waited', WANFANG_DETAIL]
    const ctx = {
      tools: {
        get: () => ({}),
        register: (definition: { name: string }) => { registered[definition.name] = definition as never },
        execute: async () => ({ isError: false, content: [{ type: 'text', text: queue.shift() ?? '' }] }),
      },
    } as unknown as Context
    const runtime = { toolTimeoutMs: 30_000, chineseSearchEnabled: () => true } as unknown as Runtime
    applyChineseSearchTools(ctx, runtime)
    const tool = registered['chinese_scholar_download']!
    const result = await tool.execute({ url: 'https://d.wanfangdata.com.cn/periodical/abc' }, exec()) as { status: string; opened: boolean }
    expect(result).toMatchObject({ status: 'link-resolved', opened: false })
    expect(queue).toHaveLength(0)
  })
})

describe('cnki-mcp client', () => {
  it('读取 FastMCP 结构化检索和详情结果，按协议发初始化通知', async () => {
    const url = 'https://kns.cnki.net/kcms2/article/abstract?v=example'
    const fetchMock = vi.fn(async (_url: string, request: RequestInit) => {
      const body = JSON.parse(String(request.body))
      if (body.method === 'initialize') {
        return Response.json({ result: { protocolVersion: '2025-06-18' } }, { headers: { 'mcp-session-id': 'cnki-session' } })
      }
      expect(new Headers(request.headers).get('mcp-session-id')).toBe('cnki-session')
      expect(new Headers(request.headers).get('mcp-protocol-version')).toBe('2025-06-18')
      if (body.method === 'notifications/initialized') {
        expect(body).not.toHaveProperty('id')
        return new Response(null, { status: 202 })
      }
      if (body.params.name === 'easy-search') {
        return Response.json({ result: { structuredContent: { result: [{ title: '科研护士角色', url }] } } })
      }
      expect(body.params).toEqual({ name: 'get-info-from-url', arguments: { url } })
      return Response.json({ result: { structuredContent: { title: '科研护士角色', authors: ['张三'], institution: '甲医院；乙大学' } } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const manager = new CnkiMcpManager(() => ({ ...CNKI_MCP_DEFAULTS, enabled: true, autoStart: false, minIntervalMs: 0 }))
    const signal = new AbortController().signal
    try {
      const papers = await manager.search({ query: '科研护士' }, signal)
      expect(papers).toEqual([expect.objectContaining({ title: '科研护士角色', landingPageUrl: url })])
      expect(await readCnkiPaper(manager, papers[0]!.landingPageUrl!, signal)).toMatchObject({
        authors: ['张三'], organizations: ['甲医院', '乙大学'],
      })
      await expect(readCnkiPaper(manager, 'https://kns.cnki.net.example.com/kcms2/article/abstract', signal)).rejects.toThrow('知网')
      expect(fetchMock).toHaveBeenCalledTimes(4)
    } finally { await manager.close() }
  })

  it('把上游登录错误传给调用方，已取消请求不连接服务', async () => {
    const fetchMock = vi.fn(async (_url: string, request: RequestInit) => {
      const body = JSON.parse(String(request.body))
      if (body.method === 'initialize') return Response.json({ result: { protocolVersion: '2025-06-18' } })
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
      return Response.json({ result: { isError: true, content: [{ type: 'text', text: '请先登录知网' }] } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const manager = new CnkiMcpManager(() => ({ ...CNKI_MCP_DEFAULTS, enabled: true, autoStart: true }))
    try {
      await expect(manager.search({ query: '科研护士' }, AbortSignal.abort(new Error('调用已取消')))).rejects.toThrow('调用已取消')
      expect(fetchMock).not.toHaveBeenCalled()
      await expect(manager.search({ query: '科研护士' }, new AbortController().signal)).rejects.toThrow('请先登录知网')
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally { await manager.close() }
  })

  it('initializes MCP and normalizes easy-search results', async () => {
    const responses = [
      { result: { protocolVersion: '2025-06-18' } },
      { result: {} },
      { result: { content: [{ type: 'text', text: JSON.stringify([{ title: '生态文明研究', authors: ['张三'], journal: '研究期刊', date: '2024-03-01', url: 'https://kns.cnki.net/kcms2/article/abstract?v=1' }]) }] } },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200, headers: { 'content-type': 'application/json', 'mcp-session-id': 'session-1' } })))
    const manager = new CnkiMcpManager(() => ({
      enabled: true,
      autoStart: false,
      endpoint: 'http://127.0.0.1:7788/mcp',
      executable: 'uv',
      projectDir: '',
      startupTimeoutMs: 1000,
      minIntervalMs: 1000,
    }))
    const papers = await manager.search({ query: '生态文明', limit: 5 }, new AbortController().signal)
    expect(papers).toEqual([expect.objectContaining({ title: '生态文明研究', source: 'cnki_mcp', year: 2024, venue: '研究期刊', authors: ['张三'] })])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
    await manager.close()
  })

  it('fails clearly when disabled', async () => {
    const manager = new CnkiMcpManager(() => ({ enabled: false, autoStart: false, endpoint: 'http://127.0.0.1:7788/mcp', executable: 'uv', projectDir: '', startupTimeoutMs: 1000, minIntervalMs: 1000 }))
    await expect(manager.search({ query: 'x' }, new AbortController().signal)).rejects.toThrow('disabled')
  })
})
