/**
 * Per-source rate limiting via a minimum-interval throttle. Each source gets a
 * configured minimum gap between successive requests; a call arriving before
 * the gap has elapsed waits for the remainder, so a burst of parallel searches
 * serializes politely instead of tripping the source's rate limit.
 * @module dsh-scholar-search/throttle
 */
/**
 * Default minimum intervals (ms) between requests to each source, derived from
 * each provider's published polite rate. Sources not listed default to
 * {@link DEFAULT_MIN_INTERVAL_MS}.
 */
export const DEFAULT_SOURCE_MIN_INTERVALS = {
    // NCBI E-utilities: 3 req/s without a key → 334ms.
    pubmed: 334,
    // Semantic Scholar shared pool: keep well under the burst threshold.
    semantic_scholar: 100,
    // arXiv asks for 3 seconds between requests.
    arxiv: 3000,
    // bioRxiv/medRxiv: no published limit; be polite.
    biorxiv: 500,
    // OpenAlex polite pool: generous, but not zero.
    openalex: 100,
    // Europe PMC: no published limit; be polite.
    europe_pmc: 100,
    // Crossref polite pool.
    crossref: 100,
    // DOAJ.
    doaj: 200,
    // CORE: free tier is rate-limited per key.
    core: 500,
    // Google Scholar via SerpAPI: paid, be conservative.
    google_scholar: 1000,
    // Link-enrichment sources.
    unpaywall: 100,
    openaire: 200,
    crossref_page: 100,
    grayarea: 1000,
};
/** Fallback for sources without a specific entry. */
export const DEFAULT_MIN_INTERVAL_MS = 100;
/**
 * Build a throttle table over the given intervals.
 * @param intervals - per-source minimum interval (ms); missing ids use the default.
 * @param defaultMs - fallback interval for unlisted sources.
 * @returns the throttle.
 */
export function buildThrottle(intervals, defaultMs = () => DEFAULT_MIN_INTERVAL_MS) {
    const nextAllowedAt = new Map();
    return {
        async wait(sourceId, signal) {
            const table = intervals();
            const gap = table[sourceId] ?? defaultMs();
            if (gap <= 0)
                return;
            const now = Date.now();
            const allowedAt = Math.max(now, nextAllowedAt.get(sourceId) ?? 0);
            nextAllowedAt.set(sourceId, allowedAt + gap);
            const waitMs = allowedAt - now;
            if (waitMs <= 0)
                return;
            await new Promise((resolvePromise, reject) => {
                const timer = setTimeout(() => {
                    cleanup();
                    resolvePromise();
                }, waitMs);
                const onAbort = () => {
                    clearTimeout(timer);
                    cleanup();
                    const error = new Error('aborted');
                    error.name = 'AbortError';
                    reject(error);
                };
                const cleanup = () => {
                    signal?.removeEventListener('abort', onAbort);
                };
                if (signal?.aborted === true) {
                    onAbort();
                    return;
                }
                signal?.addEventListener('abort', onAbort, { once: true });
            });
        },
    };
}
/**
 * Wrap a source so every `search` and `resolvePdf` call first waits for the
 * source's throttle slot.
 * @param source - the raw source.
 * @param throttle - the shared throttle table.
 * @returns the throttled source (same id).
 */
export function throttleSource(source, throttle) {
    return {
        id: source.id,
        async search(query, signal) {
            await throttle.wait(source.id, signal);
            return source.search(query, signal);
        },
        ...(source.resolvePdf === undefined
            ? {}
            : {
                async resolvePdf(paper, signal) {
                    await throttle.wait(source.id, signal);
                    return source.resolvePdf(paper, signal);
                },
            }),
    };
}
