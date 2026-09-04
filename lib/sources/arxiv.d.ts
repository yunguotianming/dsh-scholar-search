/**
 * arXiv via the public Atom API. Free, no key; hand-rolled XML parsing (the
 * feed is small and regular, a full XML dependency is not). PDF is a direct
 * `arxiv.org/pdf/{id}` link.
 * @module dsh-scholar-search/sources/arxiv
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
export declare const ARXIV_API = "https://export.arxiv.org/api/query";
/** Parse one arXiv Atom feed into normalized papers. Exported for tests. */
export declare function parseArxivFeed(xml: string): PaperMeta[];
/**
 * Create the arXiv source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export declare function arxivSource(options: () => FetchOptions): ScholarSource;
