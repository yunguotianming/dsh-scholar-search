/**
 * Crossref REST API. Free with a `mailto`; the DOI registration agency, so
 * the metadata fallback with the widest coverage. `link[]` PDFs usually need
 * a subscription — this source is metadata-first.
 * @module dsh-scholar-search/sources/crossref
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
export declare const CROSSREF_API = "https://api.crossref.org/works";
/**
 * Map one Crossref work onto {@link PaperMeta}.
 * @param record - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export declare function normalizeCrossrefWork(record: unknown): PaperMeta | undefined;
/**
 * Create the Crossref source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export declare function crossrefSource(options: () => FetchOptions): ScholarSource;
