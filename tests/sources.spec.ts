import { describe, expect, it, vi, afterEach } from 'vitest'
import { normalizeOpenAlexWork, openAlexSource } from '../src/sources/openalex.js'
import { parseArxivFeed } from '../src/sources/arxiv.js'
import { normalizeSerpApiResult, googleScholarSource } from '../src/sources/google_scholar.js'
import { europePmcOfficialPdfUrl, europePmcPmcidWithPdf } from '../src/sources/europepmc.js'
import { openAlexPdfCandidates } from '../src/sources/openalex.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

const OPENALEX_WORK = {
  id: 'https://openalex.org/W2741809807',
  title: 'Attention Is All You Need',
  doi: 'https://doi.org/10.48550/arxiv.1706.03762',
  publication_year: 2017,
  cited_by_count: 100000,
  open_access: { is_oa: true, oa_status: 'bronze', oa_url: 'https://arxiv.org/pdf/1706.03762' },
  best_oa_location: { pdf_url: 'https://arxiv.org/pdf/1706.03762', landing_page_url: 'https://arxiv.org/abs/1706.03762' },
  primary_location: { source: { display_name: 'arXiv' }, landing_page_url: 'https://arxiv.org/abs/1706.03762' },
  authorships: [{ author: { display_name: 'Ashish Vaswani' } }, { author: { display_name: 'Noam Shazeer' } }],
  abstract_inverted_index: { We: [0], propose: [1], attention: [2] },
  locations: [{ landing_page_url: 'https://arxiv.org/abs/1706.03762', pdf_url: 'https://arxiv.org/pdf/1706.03762' }],
  ids: { doi: 'https://doi.org/10.48550/arxiv.1706.03762' },
}

describe('normalizeOpenAlexWork', () => {
  it('maps a work onto PaperMeta with OA pdf, authors, rebuilt abstract', () => {
    const p = normalizeOpenAlexWork(OPENALEX_WORK)!
    expect(p.title).toBe('Attention Is All You Need')
    expect(p.source).toBe('openalex')
    expect(p.sourceId).toBe('W2741809807')
    expect(p.doi).toBe('10.48550/arxiv.1706.03762')
    expect(p.year).toBe(2017)
    expect(p.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer'])
    expect(p.isOpenAccess).toBe(true)
    expect(p.openAccessPdfUrl).toBe('https://arxiv.org/pdf/1706.03762')
    expect(p.arxivId).toBe('1706.03762')
    expect(p.abstract).toBe('We propose attention')
    expect(p.venue).toBe('arXiv')
    expect(p.citationCount).toBe(100000)
  })

  it('returns undefined without a title', () => {
    expect(normalizeOpenAlexWork({ id: 'W1' })).toBeUndefined()
  })
})

describe('openAlexSource.search', () => {
  it('fetches works and maps results; degrades to [] on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [OPENALEX_WORK] }), { status: 200 })))
    const src = openAlexSource(() => ({ timeoutMs: 5000, email: 'a@b.c' }))
    const out = await src.search({ query: 'attention' }, new AbortController().signal)
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('Attention Is All You Need')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })))
    expect(await src.search({ query: 'x' }, new AbortController().signal)).toEqual([])
  })
})

describe('parseArxivFeed', () => {
  it('parses an Atom feed into PaperMeta with a pdf id', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/1706.03762v5</id>
    <title>Attention Is All You Need</title>
    <summary>We propose a new simple network architecture, the Transformer.</summary>
    <published>2017-06-12T00:00:00Z</published>
    <author><name>Ashish Vaswani</name></author>
    <link href="https://arxiv.org/pdf/1706.03762" type="application/pdf"/>
  </entry>
</feed>`
    const out = parseArxivFeed(feed)
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('Attention Is All You Need')
    expect(out[0]!.arxivId).toBe('1706.03762')
    expect(out[0]!.authors).toEqual(['Ashish Vaswani'])
    expect(out[0]!.year).toBe(2017)
  })
})

describe('normalizeSerpApiResult', () => {
  it('maps a SerpAPI organic result onto PaperMeta', () => {
    const result = {
      position: 1,
      title: 'Attention Is All You Need',
      link: 'https://arxiv.org/abs/1706.03762',
      publication_info: { summary: 'A Vaswani, N Shazeer - arXiv preprint arXiv:1706.03762, 2017' },
      inline_links: { cited_by: { total: 100000 } },
      resources: [{ file_format: 'PDF', link: 'https://arxiv.org/pdf/1706.03762' }],
    }
    const p = normalizeSerpApiResult(result)!
    expect(p.title).toBe('Attention Is All You Need')
    expect(p.source).toBe('google_scholar')
    expect(p.year).toBe(2017)
    expect(p.authors).toEqual(['A Vaswani', 'N Shazeer'])
    expect(p.citationCount).toBe(100000)
    expect(p.openAccessPdfUrl).toBe('https://arxiv.org/pdf/1706.03762')
    expect(p.isOpenAccess).toBe(true)
  })

  it('returns undefined without a title', () => {
    expect(normalizeSerpApiResult({ link: 'https://x' })).toBeUndefined()
  })
})

describe('googleScholarSource', () => {
  it('returns [] without an API key', async () => {
    const src = googleScholarSource(() => ({ timeoutMs: 5000 }), () => undefined)
    expect(await src.search({ query: 'attention' }, new AbortController().signal)).toEqual([])
  })

  it('fetches with the key and maps organic_results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      organic_results: [{ position: 1, title: 'T', link: 'https://x' }],
    }), { status: 200 })))
    const src = googleScholarSource(() => ({ timeoutMs: 5000 }), () => 'test-key')
    const out = await src.search({ query: 'attention', yearFrom: 2020 }, new AbortController().signal)
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('T')
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).toContain('engine=google_scholar')
    expect(url).toContain('api_key=test-key')
    expect(url).toContain('as_ylo=2020')
  })
})

describe('europePmcOfficialPdfUrl / europePmcPmcidWithPdf', () => {
  it('builds the official getPdf URL from a PMCID', () => {
    expect(europePmcOfficialPdfUrl('PMC4221854')).toBe('https://europepmc.org/api/getPdf?pmcid=PMC4221854')
    expect(europePmcOfficialPdfUrl('4221854')).toBe('https://europepmc.org/api/getPdf?pmcid=PMC4221854')
  })

  it('extracts the PMCID only when the record has a PMC PDF', () => {
    expect(europePmcPmcidWithPdf({ pmcid: 'PMC4221854', hasPDF: 'Y', inPMC: 'Y' })).toBe('PMC4221854')
    expect(europePmcPmcidWithPdf({ pmcid: 'PMC4221854', hasPDF: 'N', inPMC: 'Y' })).toBeUndefined()
    expect(europePmcPmcidWithPdf({ pmcid: 'PMC4221854', hasPDF: 'Y', inPMC: 'N' })).toBeUndefined()
    expect(europePmcPmcidWithPdf({ hasPDF: 'Y' })).toBeUndefined()
  })
})

describe('openAlexPdfCandidates', () => {
  it('collects locations, best_oa_location, and the content proxy, deduplicated', () => {
    const work = {
      locations: [
        { pdf_url: 'https://repo.example.edu/a.pdf' },
        { pdf_url: 'https://publisher.com/a.pdf' },
        { pdf_url: 'https://repo.example.edu/a.pdf' },
      ],
      best_oa_location: { pdf_url: 'https://best.example.com/a.pdf' },
      content_urls: { pdf: 'https://content.openalex.org/works/W123.pdf' },
    }
    const out = openAlexPdfCandidates(work)
    expect(out).toContain('https://repo.example.edu/a.pdf')
    expect(out).toContain('https://publisher.com/a.pdf')
    expect(out).toContain('https://best.example.com/a.pdf')
    expect(out).toContain('https://content.openalex.org/works/W123.pdf')
    expect(out.length).toBe(4)
  })

  it('returns [] for a record with no candidates', () => {
    expect(openAlexPdfCandidates({ id: 'W1' })).toEqual([])
    expect(openAlexPdfCandidates('nope')).toEqual([])
  })
})
