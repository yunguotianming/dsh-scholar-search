/**
 * DOAJ — the Directory of Open Access Journals. Free, no key. Every record is
 * OA by definition; `bibjson.link` carries the full-text URL.
 * @module dsh-scholar-search/sources/doaj
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
export declare const DOAJ_API = "https://doaj.org/api/v2/search/articles";
/**
 * Map one DOAJ search result onto {@link PaperMeta}.
 * @param record - untyped result (a `bibjson` wrapper).
 * @returns the normalized paper, or `undefined` without a title.
 */
export declare function normalizeDoajArticle(record: unknown): PaperMeta | undefined;
/**
 * Create the DOAJ source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export declare function doajSource(options: () => FetchOptions): ScholarSource;
