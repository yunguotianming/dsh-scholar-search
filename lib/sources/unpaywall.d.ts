/**
 * Unpaywall — the authoritative DOI → OA PDF resolver. Free; requires an
 * email. `resolvePdf` only (it is not a search engine).
 * @module dsh-scholar-search/sources/unpaywall
 */
import type { FetchOptions } from '../http.js';
import type { ScholarSource } from '../types.js';
export declare const UNPAYWALL_API = "https://api.unpaywall.org/v2";
/** Extract the best OA PDF URL out of an Unpaywall record. Exported for tests. */
export declare function unpaywallPdfUrl(record: unknown): string | undefined;
/**
 * Create the Unpaywall link-enrichment source.
 * @param options - shared fetch options source (must include the email).
 * @returns the source.
 */
export declare function unpaywallSource(options: () => FetchOptions): ScholarSource;
