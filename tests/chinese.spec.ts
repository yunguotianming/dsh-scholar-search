import { afterEach, describe, expect, it, vi } from 'vitest'
import { CnkiMcpManager } from '../src/chinese/cnki-mcp.js'
import { isDetailUrl, parseSnapshot, providerFromUrl, resolveHref } from '../src/chinese/browser-workflow.js'

afterEach(() => vi.unstubAllGlobals())

describe('browser snapshot parsing', () => {
  it('extracts page identity, main text, and detail links', () => {
    const snapshot = parseSnapshot(`Title: 万方检索\nURL: https://s.wanfangdata.com.cn/paper?q=x\nStatus: complete\n\nMain content:\n共找到 2 条结果\n\nInteractive elements:\n  [1] link "论文一" → d.wanfangdata.com.cn/periodical/abc\n  [2] link "无关链接" → /about\n`)
    expect(snapshot.title).toBe('万方检索')
    expect(snapshot.main).toContain('共找到 2 条结果')
    expect(snapshot.items).toEqual([{ index: 1, name: '论文一', href: 'd.wanfangdata.com.cn/periodical/abc' }, { index: 2, name: '无关链接', href: '/about' }])
  })

  it('normalizes site-relative and headline links', () => {
    expect(resolveHref('/doc/1', 'https://www.cqvip.com/search?k=x')).toBe('https://www.cqvip.com/doc/1')
    expect(resolveHref('d.wanfangdata.com.cn/periodical/1', 'https://s.wanfangdata.com.cn')).toBe('https://d.wanfangdata.com.cn/periodical/1')
    expect(isDetailUrl('wanfang', 'https://d.wanfangdata.com.cn/periodical/1')).toBe(true)
    expect(isDetailUrl('cqvip', 'https://www.cqvip.com/doc/1')).toBe(true)
    expect(providerFromUrl('https://www.cqvip.com/doc/1')).toBe('cqvip')
  })
})

describe('cnki-mcp client', () => {
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
