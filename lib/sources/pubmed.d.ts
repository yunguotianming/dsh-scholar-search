/**
 * PubMed via NCBI E-utilities (esearch + esummary). Free; an optional API key
 * raises the limit from 3 to 10 req/s. The authoritative metadata source for
 * biomedicine (highest quality weight) — full text comes from Europe PMC.
 * @module dsh-scholar-search/sources/pubmed
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
/**
 * Map one esummary record onto {@link PaperMeta}.
 * @param record - untyped esummary doc.
 * @param pmid - the PMID this record was keyed by.
 * @returns the normalized paper, or `undefined` without a title.
 */
export declare function normalizePubmedSummary(record: unknown, pmid: string): PaperMeta | undefined;
/**
 * Create the PubMed source.
 * @param options - shared fetch options source.
 * @param apiKey - optional NCBI API key read per call.
 * @returns the source.
 */
export declare function pubmedSource(options: () => FetchOptions, apiKey: () => string | undefined): ScholarSource;
