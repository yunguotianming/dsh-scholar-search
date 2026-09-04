/**
 * bioRxiv and medRxiv via api.biorxiv.org. Free, no key. The API browses by
 * category and date rather than free text, so `search` filters recent
 * category listings client-side by title/abstract match.
 * @module dsh-scholar-search/sources/biorxiv
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
type Server = 'biorxiv' | 'medrxiv';
/**
 * Map one `collection[]` record onto {@link PaperMeta}.
 * @param record - untyped item.
 * @param server - which server it came from.
 * @returns the normalized paper, or `undefined` without DOI or title.
 */
export declare function normalizeRxivPaper(record: unknown, server: Server): PaperMeta | undefined;
/**
 * Create the combined bioRxiv/medRxiv source. Because the upstream API has no
 * free-text search, `search` fetches the last {@link LOOKBACK_DAYS} days of
 * both servers and filters client-side — expect fewer and fuzzier hits than
 * the indexed sources.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export declare function biorxivSource(options: () => FetchOptions): ScholarSource;
export {};
