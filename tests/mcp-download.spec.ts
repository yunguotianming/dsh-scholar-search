import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import type { JSONRPCMessage } from '@modelcontextprotocol/server'
import { describe, expect, it, vi } from 'vitest'
import { createScholarMcp } from '../src/mcp/server.js'
import { buildSources } from '../src/sources/index.js'

const detailUrl = 'https://kns.cnki.net/kcms2/article/abstract?v=test'
const downloadDir = join(tmpdir(), 'scholar-papers')

async function fixture() {
  const download = vi.fn(async ({ downloadDir: directory }: { downloadDir: string }) => ({
    provider: 'cnki' as const, detailUrl, status: 'downloaded' as const,
    path: join(directory, '论文.pdf'), format: 'pdf' as const, sizeBytes: 20,
  }))
  const registry = buildSources({
    fetchOptions: () => ({ timeoutMs: 100 }),
    semanticScholarApiKey: () => undefined, pubmedApiKey: () => undefined,
    coreApiKey: () => undefined, googleScholarApiKey: () => undefined, grayAreaMirrors: () => [],
  })
  const server = createScholarMcp({
    registry, enabledSources: () => [], toolTimeoutMs: 1000, chineseDownloader: { download },
  }, { name: 'test-scholar', version: '1.0.0' })
  const [client, transport] = InMemoryTransport.createLinkedPair()
  await client.start()
  await server.connect(transport)
  let id = 0
  async function request(method: string, params: Record<string, unknown>) {
    const requestId = ++id
    const received = new Promise<JSONRPCMessage>(resolve => {
      client.onmessage = message => { if ('id' in message && message.id === requestId) resolve(message) }
    })
    await client.send({ jsonrpc: '2.0', id: requestId, method, params })
    const reply = await received
    if (!('result' in reply)) throw new Error(JSON.stringify(reply))
    return reply.result
  }
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  await client.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  const call = async (args: Record<string, unknown>) => {
    const result = await request('tools/call', { name: 'chinese_scholar_download', arguments: { url: detailUrl, downloadDir, ...args } })
    return result.structuredContent as { status: string; confirmationId: string; downloadDir: string }
  }
  return { call, download, close: () => server.close() }
}

describe('独立 MCP 中文下载确认', () => {
  it('首次调用只返回待确认目录，确认编号可执行一次', async () => {
    const server = await fixture()
    try {
      const pending = await server.call({ title: '科研护士' })
      expect(pending).toMatchObject({ status: 'confirmation-required', downloadDir })
      expect(server.download).not.toHaveBeenCalled()
      const approved = { title: '科研护士', confirmationId: pending.confirmationId }
      expect(await server.call(approved)).toMatchObject({ status: 'downloaded', path: join(downloadDir, '论文.pdf') })
      expect(server.download).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ url: detailUrl, downloadDir, title: '科研护士' }), expect.any(AbortSignal),
      )
      expect(await server.call(approved)).toMatchObject({ status: 'confirmation-required' })
      expect(server.download).toHaveBeenCalledTimes(1)
    } finally { await server.close() }
  })

  it('换目录或文献时重新确认，不执行旧请求', async () => {
    const server = await fixture()
    try {
      const first = await server.call({})
      const anotherDir = join(downloadDir, '其他目录')
      const second = await server.call({ downloadDir: anotherDir, confirmationId: first.confirmationId })
      expect(second).toMatchObject({ status: 'confirmation-required', downloadDir: anotherDir })
      expect(second.confirmationId).not.toBe(first.confirmationId)
      const third = await server.call({ url: detailUrl.replace('test', 'second'), downloadDir: anotherDir, confirmationId: second.confirmationId })
      expect(third).toMatchObject({ status: 'confirmation-required' })
      expect(server.download).not.toHaveBeenCalled()
    } finally { await server.close() }
  })
})
