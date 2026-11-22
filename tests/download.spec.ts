import { describe, expect, it, vi, afterEach } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { downloadPaper, fetchPdfBytes, fetchPdfBytesDetailed, looksLikePdf, pdfCandidatesFor, safeFilename } from '../src/download.js'
import type { PaperMeta } from '../src/types.js'
import type { SourceRegistry } from '../src/sources/index.js'
import { buildSources } from '../src/sources/index.js'

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]) // "%PDF-1."
const HTML_BYTES = new TextEncoder().encode('<html><body>landing</body></html>')
const temporaryDirectories: string[] = []

function readablePdf(title: string, doi?: string): Uint8Array<ArrayBuffer> {
  const text = `BT /F1 12 Tf 50 700 Td (${title}) Tj${doi === undefined ? '' : ` 0 -20 Td (DOI: ${doi}) Tj`} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    `<< /Title (${title}) >>`,
  ]
  let file = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = file.length
    file += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset.toString().padStart(10, '0') + ' 00000 n \n'
  })
  const xref = file.length
  file += `xref\n0 7\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(file)
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(process.env.SCHOLAR_TEST_TEMP_DIR ?? tmpdir(), 'scholar-test-'))
  temporaryDirectories.push(directory)
  return directory
}

function registry(): SourceRegistry {
  const source = (id: string) => ({ id, search: vi.fn(async () => []), resolvePdf: vi.fn(async (): Promise<string | undefined> => undefined) })
  return {
    searchSources: [source('europe_pmc'), source('openalex'), source('semantic_scholar')],
    linkSources: { unpaywall: source('unpaywall'), openaire: source('openaire'), crossref_page: source('crossref_page'), grayarea: source('grayarea') },
  }
}

async function downloadOptions() {
  return { registry: registry(), downloadDir: await temporaryDirectory(), fetchOptions: () => ({ timeoutMs: 5000 }), pdfTimeoutMs: 5000 }
}

function paper(partial: Partial<PaperMeta> & { title: string; sourceId: string }): PaperMeta {
  return { source: 'test', ...partial }
}

afterEach(async () => {
  vi.unstubAllGlobals()
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe('looksLikePdf', () => {
  it('accepts %PDF magic and rejects other bytes', () => {
    expect(looksLikePdf(PDF_BYTES)).toBe(true)
    expect(looksLikePdf(HTML_BYTES)).toBe(false)
    expect(looksLikePdf(new Uint8Array([0x25]))).toBe(false)
  })
})

describe('safeFilename', () => {
  it('builds {slug}_{year}_{id}.pdf and strips unsafe characters', () => {
    const name = safeFilename(paper({ title: 'Attention Is All You Need!', sourceId: 'W/1:2', year: 2017 }))
    expect(name).toBe('attention-is-all-you-need_2017_W_1_2.pdf')
  })

  it('honors an override and appends .pdf', () => {
    expect(safeFilename(paper({ title: 'X', sourceId: '1' }), 'my file')).toBe('my_file.pdf')
    expect(safeFilename(paper({ title: 'X', sourceId: '1' }), 'a/b.pdf')).toBe('a_b.pdf')
  })

  it('保留中文并处理 Windows 保留名和大小写扩展名', () => {
    const input = paper({ title: 'X', sourceId: '1' })
    expect(safeFilename(input, '方向1-01_张三-2026_科研护士.pdf')).toBe('方向1-01_张三-2026_科研护士.pdf')
    expect(safeFilename(input, 'CON.PDF')).toBe('_CON.pdf')
    expect(safeFilename(input, '..\\论文:综述.PDF')).toBe('.._论文_综述.pdf')
    expect(safeFilename(input, 'a'.repeat(400))).toHaveLength(184)
  })
})

describe('pdfCandidatesFor', () => {
  it('maps arXiv abs pages to the pdf route', () => {
    expect(pdfCandidatesFor('https://arxiv.org/abs/1706.03762')).toContain('https://arxiv.org/pdf/1706.03762')
  })

  it('maps bioRxiv content pages to .full.pdf', () => {
    const out = pdfCandidatesFor('https://www.biorxiv.org/content/10.1101/2020.01.01.123456v1')
    expect(out.some((u) => u.endsWith('.full.pdf'))).toBe(true)
  })

  it('maps MDPI htm pages to pdf', () => {
    const out = pdfCandidatesFor('https://www.mdpi.com/2076-3417/10/1/100/htm')
    expect(out).toContain('https://www.mdpi.com/2076-3417/10/1/100/pdf')
  })

  it('returns nothing for an unrecognized host', () => {
    expect(pdfCandidatesFor('https://example.com/paper')).toEqual([])
  })
})

describe('fetchPdfBytes', () => {
  it('识别 403 和 HTTP 200 中的挑战页', async () => {
    for (const status of [200, 403]) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('<!DOCTYPE html><title>Just a moment...</title>', { status })))
      expect((await fetchPdfBytesDetailed('https://repo.example/p.pdf', { timeoutMs: 5000 })).failure?.reason).toBe('challenge')
    }
  })

  it('保留 HTTP 错误并识别 fetch 的 DNS cause', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })))
    expect((await fetchPdfBytesDetailed('https://repo.example/p.pdf', { timeoutMs: 5000 })).failure).toEqual({ reason: 'http-403', status: 403 })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') }) }))
    expect((await fetchPdfBytesDetailed('https://repo.example/p.pdf', { timeoutMs: 5000 })).failure?.reason).toBe('dns')
  })
  it('returns bytes when the body is a real PDF', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(PDF_BYTES, { status: 200 })))
    const out = await fetchPdfBytes('https://x/p.pdf', { timeoutMs: 5000 })
    expect(out).toBeDefined()
    expect(out!.data).toEqual(PDF_BYTES)
  })

  it('rejects a non-PDF body (landing page)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(HTML_BYTES, { status: 200 })))
    expect(await fetchPdfBytes('https://x/landing', { timeoutMs: 5000 })).toBeUndefined()
  })

  it('rejects non-OK status and non-http URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(PDF_BYTES, { status: 403 })))
    expect(await fetchPdfBytes('https://x/p.pdf', { timeoutMs: 5000 })).toBeUndefined()
    expect(await fetchPdfBytes('file:///etc/passwd', { timeoutMs: 5000 })).toBeUndefined()
  })
})

describe('downloadPaper 回归', () => {
  it('OpenAlex 第一份被拦时，尝试同来源的第二份并跳过重复地址', async () => {
    const options = await downloadOptions()
    const first = 'https://publisher.example/blocked.pdf'
    const second = 'https://repository.example/article.pdf'
    const title = 'Research nursing practice'
    const doi = '10.1000/paper'
    const sources = buildSources({
      fetchOptions: options.fetchOptions, semanticScholarApiKey: () => undefined,
      pubmedApiKey: () => undefined, coreApiKey: () => undefined,
      googleScholarApiKey: () => undefined, grayAreaMirrors: () => [],
    })
    options.registry.searchSources[1] = sources.searchSources[0]!
    const mock = vi.fn(async (url: string) => {
      if (url.startsWith('https://api.openalex.org/')) {
        return Response.json({ results: [{ locations: [{ pdf_url: first }, { pdf_url: first }, { pdf_url: second }] }] })
      }
      if (url === first) return new Response('Forbidden', { status: 403 })
      return new Response(readablePdf(title, doi))
    })
    vi.stubGlobal('fetch', mock)
    const result = await downloadPaper(paper({ title, doi, sourceId: 'openalex' }), options, new AbortController().signal)
    expect(result).toMatchObject({ source: 'openalex', url: second, pdfVerification: 'matched', attempts: [{ source: 'openalex', url: first, reason: 'http-403', status: 403 }] })
    expect(mock.mock.calls.map(([url]) => url).slice(1)).toEqual([first, second])
    expect(options.registry.linkSources.unpaywall.resolvePdf).not.toHaveBeenCalled()
  })

  it('Unpaywall 开放落地页可提取机构库 PDF 并继续尝试', async () => {
    const options = await downloadOptions()
    const first = 'https://publisher.example/blocked.pdf'
    const landing = 'https://repository.example/tqr/123'
    const direct = 'https://repository.example/cgi/viewcontent.cgi?article=123&context=tqr'
    const title = 'Research nursing practice'
    const doi = '10.1000/paper'
    const sources = buildSources({
      fetchOptions: () => ({ ...options.fetchOptions(), email: 'test@example.org' }),
      semanticScholarApiKey: () => undefined, pubmedApiKey: () => undefined,
      coreApiKey: () => undefined, googleScholarApiKey: () => undefined, grayAreaMirrors: () => [],
    })
    options.registry.linkSources.unpaywall = sources.linkSources.unpaywall
    const mock = vi.fn(async (url: string) => {
      if (url.startsWith('https://api.unpaywall.org/')) {
        return Response.json({ best_oa_location: { url_for_pdf: first }, oa_locations: [{ url_for_landing_page: landing }] })
      }
      if (url === first) return new Response('<title>Just a moment...</title>', { status: 403 })
      if (url === landing) return new Response('<a href="/cgi/viewcontent.cgi?article=123&amp;context=tqr">PDF</a>')
      if (url === direct) return new Response(readablePdf(title))
      throw new Error(`意外请求：${url}`)
    })
    vi.stubGlobal('fetch', mock)
    const result = await downloadPaper(paper({ title, doi, sourceId: 'unpaywall' }), options, new AbortController().signal)
    expect(result).toMatchObject({ source: 'unpaywall', url: direct, pdfVerification: 'matched', attempts: [
      { source: 'unpaywall', url: first, reason: 'challenge', status: 403 },
      { source: 'unpaywall', url: landing, reason: 'not-pdf' },
    ] })
    expect(mock.mock.calls.map(([url]) => url).slice(1)).toEqual([first, landing, direct])
  })

  it('错配的 PDF 会跳过，后续来源的正确文件才写入目录', async () => {
    const options = await downloadOptions()
    const wrong = 'https://publisher.example/wrong.pdf'
    const right = 'https://repository.example/right.pdf'
    const title = 'Research nursing practice'
    options.registry.linkSources.unpaywall.resolvePdf = vi.fn(async () => right)
    const valid = readablePdf(title)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url === wrong ? readablePdf('National Workforce Framework') : valid)))
    const result = await downloadPaper(paper({ title, doi: '10.1000/paper', sourceId: '1', openAccessPdfUrl: wrong }), options, new AbortController().signal)
    expect(result).toMatchObject({ url: right, pdfVerification: 'matched', attempts: [{ source: 'direct', url: wrong, reason: 'content-mismatch' }] })
    expect(await readFile((result as { path: string }).path)).toEqual(Buffer.from(valid))
    expect(await readdir(options.downloadDir)).toHaveLength(1)
  })

  it('首页 DOI 明确错配时不保存，只返回可人工补齐的链接', async () => {
    const options = await downloadOptions()
    const wrong = 'https://publisher.example/wrong.pdf'
    const landing = 'https://publisher.example/article'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(readablePdf('Other nursing research', '10.1000/other'))))
    const result = await downloadPaper(paper({ title: '10.1000/expected', doi: '10.1000/expected', sourceId: '1', landingPageUrl: landing, openAccessPdfUrl: wrong }), options, new AbortController().signal)
    expect(result).toMatchObject({ error: 'content-mismatch', manualLinks: [landing, 'https://doi.org/10.1000/expected'] })
    expect(await readdir(options.downloadDir)).toEqual([])
  })

  it('旧清单 DOI 指向另一篇文章时，返回规范元数据并停止 PDF 下载', async () => {
    const options = await downloadOptions()
    options.registry.searchSources.push({ id: 'crossref', search: vi.fn(async () => [{ title: 'Completely unrelated infection study', doi: '10.1000/a', source: 'crossref', sourceId: '10.1000/a' }]) })
    vi.stubGlobal('fetch', vi.fn())
    const result = await downloadPaper(paper({ title: 'Research nursing leadership', doi: '10.1000/a', sourceId: '1' }), { ...options, verifyMetadata: true }, new AbortController().signal)
    expect(result).toMatchObject({ error: 'metadata-mismatch', metadata: { title: 'Completely unrelated infection study' } })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('元数据核对无结果时不下载，不把未知 DOI 误报为没有全文', async () => {
    const options = await downloadOptions()
    options.registry.searchSources.push({ id: 'crossref', search: vi.fn(async () => []) })
    vi.stubGlobal('fetch', vi.fn())
    expect(await downloadPaper(paper({ title: 'Research nursing', doi: '10.1000/a', sourceId: '1' }), { ...options, verifyMetadata: true }, new AbortController().signal)).toMatchObject({ error: 'metadata-unverified' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('元数据核对成功后使用卷期年，返回规范著录字段', async () => {
    const options = await downloadOptions()
    options.registry.searchSources.push({ id: 'crossref', search: vi.fn(async () => [{ title: 'Research nursing: a study', doi: '10.1000/a', source: 'crossref', sourceId: '10.1000/a', year: 2022, printYear: 2022, onlineYear: 2021, volume: '31' }]) })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(PDF_BYTES)))
    const result = await downloadPaper(paper({ title: 'Research nursing', doi: '10.1000/a', sourceId: '1', year: 2021, openAccessPdfUrl: 'https://repo.example/p.pdf' }), { ...options, verifyMetadata: true }, new AbortController().signal)
    expect(result).toMatchObject({ metadata: { year: 2022, onlineYear: 2021, volume: '31' } })
    expect('path' in result && result.path).toContain('_2022_')
  })
  it('Europe PMC 成功后不再请求其他补链源，且只留下 PDF', async () => {
    const options = await downloadOptions()
    options.registry.searchSources[0]!.resolvePdf = vi.fn(async () => 'https://europepmc.org/api/getPdf?pmcid=PMC1')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(PDF_BYTES)))
    const result = await downloadPaper(paper({ title: '科研护士', sourceId: '1' }), options, new AbortController().signal)
    expect(result).toMatchObject({ source: 'europe_pmc', sizeBytes: PDF_BYTES.length, pdfVerification: 'unverified' })
    expect(options.registry.searchSources[1]!.resolvePdf).not.toHaveBeenCalled()
    expect(options.registry.linkSources.unpaywall.resolvePdf).not.toHaveBeenCalled()
    expect(await readdir(options.downloadDir)).toHaveLength(1)
    expect(await readFile((result as { path: string }).path)).toEqual(Buffer.from(PDF_BYTES))
  })

  it('下载前发现目标不是目录，网络调用次数为零', async () => {
    const options = await downloadOptions()
    options.downloadDir = join(options.downloadDir, 'file')
    await writeFile(options.downloadDir, 'existing')
    vi.stubGlobal('fetch', vi.fn())
    const result = await downloadPaper(paper({ title: 'X', sourceId: '1' }), options, new AbortController().signal)
    expect(result).toMatchObject({ error: 'write-error', triedSources: [] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('拒绝直连和浏览器返回的 HTML，不产生假 PDF', async () => {
    const options = await downloadOptions()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(HTML_BYTES)))
    const result = await downloadPaper(paper({ title: 'X', sourceId: '1', openAccessPdfUrl: 'https://repo.example/p.pdf' }), {
      ...options, browser: { fetchPdf: vi.fn(async () => ({ data: HTML_BYTES, finalUrl: 'https://repo.example/p.pdf' })) },
    }, new AbortController().signal)
    expect(result).toMatchObject({ error: 'no-free-fulltext', failureKind: 'candidates-failed', attempts: [expect.objectContaining({ reason: 'not-pdf' })] })
    expect(await readdir(options.downloadDir)).toEqual([])
  })

  it('浏览器异常后继续其他开放副本，且保留前一候选的失败记录', async () => {
    const options = await downloadOptions()
    options.registry.linkSources.unpaywall.resolvePdf = vi.fn(async () => 'https://repo.example/good.pdf')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('good.pdf') ? new Response(PDF_BYTES) : new Response('Forbidden', { status: 403 })))
    const result = await downloadPaper(paper({ title: 'X', sourceId: '1', openAccessPdfUrl: 'https://repo.example/blocked.pdf' }), {
      ...options, browser: { fetchPdf: vi.fn(async () => { throw new Error('浏览器不可用') }) },
    }, new AbortController().signal)
    expect(result).toMatchObject({ source: 'unpaywall', attempts: [expect.objectContaining({ reason: 'http-403', status: 403 })] })
  })

  it('来源解析异常降级，取消信号继续传播', async () => {
    const options = await downloadOptions()
    options.registry.searchSources[0]!.resolvePdf = vi.fn(async () => { throw new Error('来源故障') })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(PDF_BYTES)))
    const result = await downloadPaper(paper({ title: 'X', sourceId: '1', openAccessPdfUrl: 'https://repo.example/p.pdf' }), options, new AbortController().signal)
    expect(result).toMatchObject({ source: 'direct', attempts: [{ source: 'europe_pmc', reason: 'lookup-failed' }] })
    const controller = new AbortController()
    controller.abort(new Error('用户取消'))
    await expect(downloadPaper(paper({ title: 'X', sourceId: '1' }), options, controller.signal)).rejects.toThrow('用户取消')
  })

  it('同名文件不覆盖，空链和候选访问失败分别返回', async () => {
    const options = await downloadOptions()
    const input = paper({ title: 'X', sourceId: '1', openAccessPdfUrl: 'https://repo.example/p.pdf' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(PDF_BYTES)))
    await downloadPaper(input, options, new AbortController().signal)
    const duplicate = await downloadPaper(input, options, new AbortController().signal)
    expect(duplicate).toMatchObject({ error: 'file-exists' })
    const empty = await downloadPaper(paper({ title: 'Y', sourceId: '2' }), options, new AbortController().signal)
    expect(empty).toMatchObject({ error: 'no-free-fulltext', failureKind: 'no-candidate' })
  })
})
