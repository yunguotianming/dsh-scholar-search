/**
 * Google Scholar via SerpAPI. Google Scholar has no official API; SerpAPI is
 * the only stable, sanctioned route (paid, free tier 100 searches/month). The
 * source is skipped entirely without a key.
 * @module dsh-scholar-search/sources/google-scholar
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
export declare const SERPAPI_SCHOLAR_API = "https://serpapi.com/search";
/**
 * Map one SerpAPI organic result onto {@link PaperMeta}. SerpAPI returns
 * `organic_results[]` with `title`, `link`, `publication_info.summary`,
 * `inline_links.cited_by.total`, and optional `resources[]` with PDF links.
 * @param record - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export declare function normalizeSerpApiResult(record: unknown): PaperMeta | undefined;
/**
 * Create the Google Scholar source. Skips (returns empty results) when no
 * SerpAPI key is configured.
 * @param options - shared fetch options source.
 * @param apiKey - SerpAPI key read per call.
 * @returns the source.
 */
export declare function googleScholarSource(options: () => FetchOptions, apiKey: () => string | undefined): ScholarSource;
