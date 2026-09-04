/**
 * CORE — the largest OA repository aggregator. Needs a free API key; without
 * one the source reports itself unavailable and is skipped by the fan-out.
 * @module dsh-scholar-search/sources/core
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
export declare const CORE_API = "https://api.core.ac.uk/v3/search/works";
/**
 * Map one CORE work onto {@link PaperMeta}.
 * @param record - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export declare function normalizeCoreWork(record: unknown): PaperMeta | undefined;
/**
 * Create the CORE source.
 * @param options - shared fetch options source.
 * @param apiKey - CORE API key read per call; `search` returns `[]` when absent.
 * @returns the source.
 */
export declare function coreSource(options: () => FetchOptions, apiKey: () => string | undefined): ScholarSource;
