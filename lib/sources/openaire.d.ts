/**
 * OpenAIRE — the European OA aggregator. Free, no key. `resolvePdf` only:
 * full-text links are mined from the record's `instance[]` nodes, with
 * low-value URLs (OpenAIRE metadata pages, Google links) filtered out —
 * the same convention as QwenPaw local_paper_hub's providers_oa_discovery.
 * @module dsh-scholar-search/sources/openaire
 */
import type { FetchOptions } from '../http.js';
import type { ScholarSource } from '../types.js';
export declare const OPENAIRE_API = "https://api.openaire.eu/search/publications";
/** Whether a URL points at an OpenAIRE metadata page or another known-low-value host. */
export declare function isLowValueUrl(url: string): boolean;
/** Whether a URL looks like it serves a PDF. */
export declare function isPdfishUrl(url: string): boolean;
/**
 * Resolve a DOI to OpenAIRE full-text candidates, best (PDF-looking) first.
 * @param doi - bare DOI.
 * @param options - fetch options.
 * @param signal - cancellation.
 * @returns candidate URLs, possibly empty.
 */
export declare function openaireCandidates(doi: string, options: FetchOptions, signal: AbortSignal): Promise<string[]>;
/**
 * Create the OpenAIRE link-enrichment source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export declare function openaireSource(options: () => FetchOptions): ScholarSource;
