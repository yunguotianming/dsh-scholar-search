import { describe, expect, it, vi, afterEach } from 'vitest'
import { pdfUrlFromGrayAreaHtml, scihubResolvePdf, scihubPingMirror } from '../src/sources/grayarea.js'
import { DEFAULT_GRAYAREA_MIRRORS } from '../src/sources/grayarea.js'

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

afterEach(() => {
  vi.unstubAllGlobals()
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
