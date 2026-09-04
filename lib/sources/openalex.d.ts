/**
 * OpenAlex — the search backbone. Free, no key; pass `mailto` for the polite
 * pool. Abstracts arrive as `abstract_inverted_index` (word → positions) and
 * must be rebuilt into prose here.
 * @module dsh-scholar-search/sources/openalex
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
export declare const OPENALEX_API = "https://api.openalex.org/works";
/**
 * Rebuild prose from OpenAlex's `abstract_inverted_index` (word → list of
 * positions). Returns `undefined` when the index is absent or empty.
 * @param index - the raw inverted index.
 * @returns the rebuilt abstract.
 */
export declare function rebuildAbstract(index: unknown): string | undefined;
/**
 * Map one OpenAlex `work` record onto {@link PaperMeta}.
 * @param work - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export declare function normalizeOpenAlexWork(work: unknown): PaperMeta | undefined;
/**
 * Collect every OA PDF candidate from an OpenAlex work: all `locations[].pdf_url`
 * (institutional repositories, content proxies, publisher OA PDFs — in that
 * order of preference) plus the `content_urls.pdf` OpenAlex content proxy.
 * Exported for tests and for the download chain's multi-candidate use.
 * @param work - untyped record.
 * @returns candidate URLs, best first, deduplicated.
 */
export declare function openAlexPdfCandidates(work: unknown): string[];
/**
 * Create the OpenAlex source.
 * @param options - shared fetch options source (email + timeout read per call).
 * @returns the source.
 */
export declare function openAlexSource(options: () => FetchOptions): ScholarSource;
