/**
 * Per-source rate limiting via a minimum-interval throttle. Each source gets a
 * configured minimum gap between successive requests; a call arriving before
 * the gap has elapsed waits for the remainder, so a burst of parallel searches
 * serializes politely instead of tripping the source's rate limit.
 * @module dsh-scholar-search/throttle
 */
import type { ScholarSource } from './types.js';
/**
 * Default minimum intervals (ms) between requests to each source, derived from
 * each provider's published polite rate. Sources not listed default to
 * {@link DEFAULT_MIN_INTERVAL_MS}.
 */
export declare const DEFAULT_SOURCE_MIN_INTERVALS: Record<string, number>;
/** Fallback for sources without a specific entry. */
export declare const DEFAULT_MIN_INTERVAL_MS = 100;
/** A live throttle table, one entry per source id. */
export interface ThrottleTable {
    /** Wait until `sourceId`'s next allowed instant, then return. */
    wait(sourceId: string, signal?: AbortSignal | undefined): Promise<void>;
}
/**
 * Build a throttle table over the given intervals.
 * @param intervals - per-source minimum interval (ms); missing ids use the default.
 * @param defaultMs - fallback interval for unlisted sources.
 * @returns the throttle.
 */
export declare function buildThrottle(intervals: () => Record<string, number>, defaultMs?: () => number): ThrottleTable;
/**
 * Wrap a source so every `search` and `resolvePdf` call first waits for the
 * source's throttle slot.
 * @param source - the raw source.
 * @param throttle - the shared throttle table.
 * @returns the throttled source (same id).
 */
export declare function throttleSource(source: ScholarSource, throttle: ThrottleTable): ScholarSource;
