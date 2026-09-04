import { describe, expect, it } from 'vitest'
import { buildThrottle, throttleSource, DEFAULT_SOURCE_MIN_INTERVALS } from '../src/throttle.js'
import type { ScholarSource } from '../src/types.js'

describe('buildThrottle', () => {
  it('lets the first call through immediately, then enforces the gap', async () => {
    const throttle = buildThrottle(() => ({ pubmed: 50 }), () => 10)
    const t0 = Date.now()
    await throttle.wait('pubmed')
    const t1 = Date.now()
    await throttle.wait('pubmed')
    const t2 = Date.now()
    expect(t1 - t0).toBeLessThan(20) // first call: no wait
    expect(t2 - t1).toBeGreaterThanOrEqual(40) // second call: waited ~50ms
  })

  it('uses the default interval for unlisted sources', async () => {
    const throttle = buildThrottle(() => ({}), () => 30)
    await throttle.wait('unknown_source')
    const t0 = Date.now()
    await throttle.wait('unknown_source')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(20)
  })

  it('throttles sources independently', async () => {
    const throttle = buildThrottle(() => ({ a: 50, b: 50 }), () => 10)
    await throttle.wait('a')
    const t0 = Date.now()
    await throttle.wait('b') // different source: no wait
    expect(Date.now() - t0).toBeLessThan(20)
  })

  it('returns immediately when the interval is zero', async () => {
    const throttle = buildThrottle(() => ({ x: 0 }), () => 10)
    const t0 = Date.now()
    await throttle.wait('x')
    await throttle.wait('x')
    expect(Date.now() - t0).toBeLessThan(20)
  })

  it('rejects on abort', async () => {
    const throttle = buildThrottle(() => ({ slow: 5000 }), () => 10)
    await throttle.wait('slow') // consume the free first slot
    const controller = new AbortController()
    const pending = throttle.wait('slow', controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('aborted')
  })
})

describe('throttleSource', () => {
  function fakeSource(id: string): ScholarSource & { calls: number } {
    const state = { calls: 0 }
    return {
      id,
      get calls() { return state.calls },
      async search() {
        state.calls += 1
        return []
      },
      async resolvePdf() {
        state.calls += 1
        return undefined
      },
    }
  }

  it('wraps search and resolvePdf with the throttle', async () => {
    const src = fakeSource('pubmed')
    const throttle = buildThrottle(() => ({ pubmed: 40 }), () => 10)
    const wrapped = throttleSource(src, throttle)
    await wrapped.search({ query: 'a' }, new AbortController().signal)
    const t0 = Date.now()
    await wrapped.search({ query: 'b' }, new AbortController().signal)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(30)
    expect(src.calls).toBe(2)
  })

  it('preserves the source id and optional resolvePdf', async () => {
    const src = fakeSource('arxiv')
    const throttle = buildThrottle(() => ({}), () => 0)
    const wrapped = throttleSource(src, throttle)
    expect(wrapped.id).toBe('arxiv')
    expect(typeof wrapped.resolvePdf).toBe('function')
  })
})

describe('DEFAULT_SOURCE_MIN_INTERVALS', () => {
  it('covers every shipped search source', () => {
    for (const id of ['openalex', 'semantic_scholar', 'pubmed', 'europe_pmc', 'arxiv', 'biorxiv', 'crossref', 'doaj', 'core']) {
      expect(DEFAULT_SOURCE_MIN_INTERVALS[id]).toBeGreaterThan(0)
    }
    expect(DEFAULT_SOURCE_MIN_INTERVALS['arxiv']).toBeGreaterThanOrEqual(3000)
    expect(DEFAULT_SOURCE_MIN_INTERVALS['pubmed']).toBeGreaterThanOrEqual(334)
  })
})
