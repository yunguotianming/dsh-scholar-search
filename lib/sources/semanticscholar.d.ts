/**
 * Semantic Scholar Graph API. Free; an optional API key lifts the shared
 * rate limit. `openAccessPdf.url` carries the OA link.
 * @module dsh-scholar-search/sources/semanticscholar
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
export declare const S2_API = "https://api.semanticscholar.org/graph/v1/paper";
/**
 * Map one Semantic Scholar paper record onto {@link PaperMeta}.
 * @param record - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export declare function normalizeS2Paper(record: unknown): PaperMeta | undefined;
/**
 * Create the Semantic Scholar source.
 * @param options - shared fetch options source.
 * @param apiKey - optional API key read per call.
 * @returns the source.
 */
export declare function semanticScholarSource(options: () => FetchOptions, apiKey: () => string | undefined): ScholarSource;
