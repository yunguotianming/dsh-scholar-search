import { describe, expect, it, vi, afterEach } from 'vitest'
import { fetchPdfBytes, looksLikePdf, pdfCandidatesFor, safeFilename } from '../src/download.js'
import type { PaperMeta } from '../src/types.js'

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]) // "%PDF-1."
const HTML_BYTES = new TextEncoder().encode('<html><body>landing</body></html>')

function paper(partial: Partial<PaperMeta> & { title: string; sourceId: string }): PaperMeta {
  return { source: 'test', ...partial }
}

afterEach(() => {
  vi.unstubAllGlobals()
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
