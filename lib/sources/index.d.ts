/**
 * Source registry: builds every adapter from the resolved plugin config and
 * exposes the search fan-out set plus the download fallback chain.
 * @module dsh-scholar-search/sources
 */
import type { FetchOptions } from '../http.js';
import type { ScholarSource } from '../types.js';
export { buildThrottle, throttleSource, DEFAULT_SOURCE_MIN_INTERVALS, DEFAULT_MIN_INTERVAL_MS } from '../throttle.js';
export type { ThrottleTable } from '../throttle.js';
export { openAlexSource, normalizeOpenAlexWork, rebuildAbstract, openAlexPdfCandidates, OPENALEX_API } from './openalex.js';
export { semanticScholarSource, normalizeS2Paper, S2_API } from './semanticscholar.js';
export { pubmedSource, normalizePubmedSummary } from './pubmed.js';
export { europePmcSource, normalizeEuropePmcResult, europePmcPdfUrl, europePmcOfficialPdfUrl, europePmcPmcidWithPdf, EUROPEPMC_API } from './europepmc.js';
export { arxivSource, parseArxivFeed, ARXIV_API } from './arxiv.js';
export { biorxivSource, normalizeRxivPaper } from './biorxiv.js';
export { crossrefSource, normalizeCrossrefWork, CROSSREF_API } from './crossref.js';
export { doajSource, normalizeDoajArticle, DOAJ_API } from './doaj.js';
export { coreSource, normalizeCoreWork, CORE_API } from './core.js';
export { googleScholarSource, normalizeSerpApiResult, SERPAPI_SCHOLAR_API } from './google_scholar.js';
export { unpaywallSource, unpaywallPdfUrl, UNPAYWALL_API } from './unpaywall.js';
export { openaireSource, openaireCandidates, isLowValueUrl, isPdfishUrl, OPENAIRE_API } from './openaire.js';
export { crossrefPageSource, citationPdfUrlFromHtml } from './crossref_page.js';
export { grayareaSource, pdfUrlFromGrayAreaHtml, DEFAULT_GRAYAREA_MIRRORS, scihubResolvePdf, scihubPingMirror } from './grayarea.js';
export type { MirrorProbe } from './grayarea.js';
/** Everything `apply` needs to wire sources to the live config. */
export interface SourceRegistryOptions {
    /** Live fetch options (email + timeout), read per request. */
    fetchOptions: () => FetchOptions;
    semanticScholarApiKey: () => string | undefined;
    pubmedApiKey: () => string | undefined;
    coreApiKey: () => string | undefined;
    /** SerpAPI key for Google Scholar; the source is skipped without it. */
    googleScholarApiKey: () => string | undefined;
    allowGrayArea: () => boolean;
    grayAreaMirrors: () => string[];
    /** Live per-source minimum request intervals (ms); merged over the defaults. */
    sourceMinIntervals?: (() => Record<string, number>) | undefined;
}
/** All search-capable source ids, in fan-out order. */
export declare const SEARCH_SOURCE_IDS: readonly ["openalex", "semantic_scholar", "pubmed", "europe_pmc", "arxiv", "biorxiv", "crossref", "doaj", "core", "google_scholar"];
/** The built registry: search sources plus the link-enrichment fallback chain. */
export interface SourceRegistry {
    /** Search sources, filtered by `enabledSources` at call time. */
    searchSources: ScholarSource[];
    /** `resolvePdf` sources in DESIGN §9 fallback order (see download.ts). */
    linkSources: Record<'unpaywall' | 'openaire' | 'crossref_page' | 'grayarea', ScholarSource>;
}
/**
 * Build the full source registry.
 * @param options - live config accessors.
 * @returns the registry.
 */
export declare function buildSources(options: SourceRegistryOptions): SourceRegistry;
