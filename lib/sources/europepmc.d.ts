/**
 * Europe PMC REST search. Free, no key. Biomedical full text: `fullTextUrlList`
 * carries free-full-text links and `pmcid` maps onto PMC OA PDFs.
 * @module dsh-scholar-search/sources/europepmc
 */
import type { FetchOptions } from '../http.js';
import type { PaperMeta, ScholarSource } from '../types.js';
export declare const EUROPEPMC_API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
/**
 * Europe PMC's official PDF download endpoint (empirically the highest-yield
 * channel for PMC-indexed OA papers). Two equivalent forms; the api/getPdf one
 * is preferred. Intermittently 403s — the caller retries.
 */
export declare function europePmcOfficialPdfUrl(pmcid: string): string;
/** Extract the PMCID out of a Europe PMC search record, when it has a PMC-hosted OA PDF. */
export declare function europePmcPmcidWithPdf(record: unknown): string | undefined;
/** Pick the first free PDF-looking URL out of a `fullTextUrlList` entry list. */
export declare function europePmcPdfUrl(record: Record<string, unknown>): string | undefined;
/**
 * Map one Europe PMC result onto {@link PaperMeta}.
 * @param record - untyped result record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export declare function normalizeEuropePmcResult(record: unknown): PaperMeta | undefined;
/**
 * Create the Europe PMC source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export declare function europePmcSource(options: () => FetchOptions): ScholarSource;
