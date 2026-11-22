import { describe, expect, it } from 'vitest'
import { mergeAndRank, mergePaperLists, mergePapers, normalizeTitle, paperKeys, scorePaper, SOURCE_QUALITY } from '../src/paper.js'
import type { PaperMeta } from '../src/types.js'
import { rebuildAbstract } from '../src/sources/openalex.js'

function paper(partial: Partial<PaperMeta> & { title: string; source: string; sourceId: string }): PaperMeta {
  return { ...partial }
}

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation, keeps CJK, collapses whitespace', () => {
    expect(normalizeTitle('  Attention Is All You Need! ')).toBe('attention is all you need')
    expect(normalizeTitle('护理场景中 RAG 的应用：综述')).toBe('护理场景中 rag 的应用 综述')
  })
})

describe('paperKeys', () => {
  it('orders doi before arxiv before pmid before url before title', () => {
    const keys = paperKeys(paper({
      title: 'X', source: 's', sourceId: '1',
      doi: '10.1000/XYZ', arxivId: '1706.03762', pmid: '12345',
    }))
    expect(keys[0]).toBe('doi:10.1000/xyz')
    expect(keys[1]).toBe('arxiv:1706.03762')
    expect(keys[2]).toBe('pmid:12345')
    expect(keys[keys.length - 1]).toMatch(/^title:/)
  })

  it('normalizes doi prefixes and arxiv version suffixes', () => {
    const keys = paperKeys(paper({
      title: 'X', source: 's', sourceId: '1',
      doi: 'https://doi.org/10.1038/NATURE12373', arxivId: 'arXiv:1706.03762v5',
    }))
    expect(keys).toContain('doi:10.1038/nature12373')
    expect(keys).toContain('arxiv:1706.03762')
  })
})

describe('mergePapers', () => {
  it('卷期年覆盖在线年，并保留来源给出的卷期页码', () => {
    const base = paper({ title: 'T', source: 'semantic_scholar', sourceId: 'a', year: 2021 })
    const authoritative = paper({ title: 'T', source: 'crossref', sourceId: 'b', year: 2022, printYear: 2022, onlineYear: 2021, volume: '31', pages: '3414–3427' })
    expect(mergePapers(base, authoritative)).toMatchObject({ year: 2022, onlineYear: 2021, volume: '31', pages: '3414–3427' })
  })
  it('keeps the stronger source identity and fills absent fields', () => {
    const base = paper({ title: 'T', source: 'openalex', sourceId: 'W1', citationCount: 5 })
    const incoming = paper({ title: 'T', source: 'pubmed', sourceId: '123', doi: '10.1/x', abstract: 'longer abstract' })
    const merged = mergePapers(base, incoming)
    // pubmed outranks openalex in SOURCE_QUALITY.
    expect(merged.source).toBe('pubmed')
    expect(merged.sourceId).toBe('123')
    expect(merged.doi).toBe('10.1/x')
    expect(merged.abstract).toBe('longer abstract')
    expect(merged.citationCount).toBe(5)
    expect(merged.oaSources).toContain('openalex')
    expect(merged.oaSources).toContain('pubmed')
  })
})

describe('mergePaperLists', () => {
  it('同名但 DOI 不同的文章保持独立，两个 S2 ID 的相同 DOI 合并', () => {
    const a = paper({ title: '相同标题', source: 'semantic_scholar', sourceId: 's2-a', doi: '10.1000/a' })
    const b = paper({ title: '相同标题', source: 'semantic_scholar', sourceId: 's2-b', doi: '10.1000/b' })
    const duplicate = { ...a, sourceId: 's2-c', title: '更新后的标题' }
    expect(mergePaperLists([a, b, duplicate])).toHaveLength(2)
    expect(mergeAndRank([[a, b, duplicate]], 10, 2026)).toHaveLength(2)
    expect(mergePaperLists([{ ...a, pmid: '111' }, { ...duplicate, pmid: '222' }])).toHaveLength(1)
  })

  it('桥接记录合并先前分开的 DOI 和 PMID 记录', () => {
    const a = paper({ title: 'First title', source: 'crossref', sourceId: 'a', doi: '10.1000/a' })
    const b = paper({ title: 'Another title', source: 'pubmed', sourceId: 'b', pmid: '12345' })
    const bridge = { ...a, pmid: '12345' }
    expect(mergePaperLists([a, b, bridge])).toHaveLength(1)
    expect(mergeAndRank([[a], [b, bridge]], 10, 2026)).toHaveLength(1)
  })
  it('dedupes by shared doi across sources', () => {
    const a = paper({ title: 'Attention Is All You Need', source: 'arxiv', sourceId: '1706.03762', arxivId: '1706.03762' })
    const b = paper({ title: 'Attention Is All You Need', source: 'openalex', sourceId: 'W1', doi: '10.1/attn', arxivId: '1706.03762' })
    const out = mergePaperLists([a, b])
    expect(out).toHaveLength(1)
    expect(out[0]!.oaSources).toEqual(expect.arrayContaining(['arxiv', 'openalex']))
  })

  it('keeps distinct papers distinct', () => {
    const a = paper({ title: 'Alpha', source: 'arxiv', sourceId: '1' })
    const b = paper({ title: 'Beta', source: 'arxiv', sourceId: '2' })
    expect(mergePaperLists([a, b])).toHaveLength(2)
  })
})

describe('scorePaper', () => {
  it('weights source quality, recency, and OA bonus', () => {
    const nowYear = 2026
    const p = paper({ title: 'T', source: 'pubmed', sourceId: '1', year: 2025, openAccessPdfUrl: 'https://x/p.pdf' })
    const high = scorePaper(p, 0, 10, nowYear)
    const old = scorePaper({ ...p, year: 1990 }, 0, 10, nowYear)
    const closedPaper = paper({ title: 'T', source: 'pubmed', sourceId: '1', year: 2025 })
    const closed = scorePaper(closedPaper, 0, 10, nowYear)
    expect(high).toBeGreaterThan(old)
    expect(high).toBeGreaterThan(closed)
    expect(SOURCE_QUALITY['pubmed']).toBeGreaterThan(SOURCE_QUALITY['core'] ?? 0)
  })
})

describe('mergeAndRank', () => {
  it('ranks higher-quality, OA, recent papers first and caps at limit', () => {
    const nowYear = 2026
    const oa = paper({ title: 'OA', source: 'europe_pmc', sourceId: '1', year: 2025, openAccessPdfUrl: 'https://x/p.pdf', doi: '10.1/oa' })
    const closed = paper({ title: 'Closed', source: 'crossref', sourceId: '2', year: 2010, doi: '10.1/closed' })
    const out = mergeAndRank([[closed], [oa]], 10, nowYear)
    expect(out[0]!.title).toBe('OA')
    expect(out).toHaveLength(2)
    expect(mergeAndRank([[oa, closed]], 1, nowYear)).toHaveLength(1)
  })
})

describe('rebuildAbstract', () => {
  it('rebuilds prose from the OpenAlex inverted index', () => {
    const index = {
      'Hello': [0],
      'world': [1],
      'this': [2],
      'is': [3, 5],
      'a': [4],
      'test': [6],
    }
    expect(rebuildAbstract(index)).toBe('Hello world this is a is test')
  })

  it('returns undefined for empty or malformed input', () => {
    expect(rebuildAbstract(undefined)).toBeUndefined()
    expect(rebuildAbstract({})).toBeUndefined()
    expect(rebuildAbstract('nope')).toBeUndefined()
  })
})
