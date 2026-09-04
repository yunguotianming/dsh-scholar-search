/**
 * The PDF download fallback chain (DESIGN §9): ten levels from the OA link a
 * source already surfaced down to the optional gray-area mirrors. Every level
 * either yields a verified PDF (%PDF magic, http(s) URL after redirects) or
 * degrades to "try the next level" — 401/403/429/timeouts never break the chain.
 * @module dsh-scholar-search/download
 */
import type { FetchOptions } from './http.js';
import type { PaperMeta } from './types.js';
import type { SourceRegistry } from './sources/index.js';
/** `%PDF` magic. */
export declare function looksLikePdf(bytes: Uint8Array): boolean;
/** Candidate PDF URLs derived from an OA publisher landing page (dsh-ai4scholar pattern table). */
export declare function pdfCandidatesFor(landingUrl: string): string[];
/** Filesystem-safe filename: `{safeTitle}_{year}_{sourceId}.pdf`. */
export declare function safeFilename(paper: PaperMeta, override?: string | undefined): string;
/** A verified PDF download, before it is written to disk. */
export interface PdfFetch {
    data: Uint8Array;
    finalUrl: string;
}
/** Why a fetch attempt failed, for diagnostics. */
export interface FetchFailure {
    /** HTTP status (403/404/...), 'timeout', 'dns', 'abort', 'not-pdf', 'non-http', or 'network'. */
    reason: string;
    /** HTTP status code when the failure is an HTTP response. */
    status?: number;
}
/** A fetched PDF, or the reason no PDF came back. */
export interface PdfFetchResult {
    fetch?: PdfFetch;
    failure?: FetchFailure;
}
/**
 * Fetch one URL and verify it actually serves a PDF. Europe PMC's official
 * endpoint 403s intermittently and is retried up to 3 times with a 2s gap.
 * @param url - candidate PDF URL.
 * @param options - timeout and cancellation.
 * @returns the bytes and final URL, or the failure reason.
 */
export declare function fetchPdfBytesDetailed(url: string, options: {
    timeoutMs: number;
    signal?: AbortSignal | undefined;
}): Promise<PdfFetchResult>;
/**
 * Fetch one URL and verify it actually serves a PDF. Returns `undefined` on
 * any HTTP/transport failure, non-http(s) redirect target, or non-PDF body.
 * Europe PMC's official PDF endpoint 403s intermittently — it is retried up to
 * 3 times with a 2s gap (per the field report's findings).
 * @param url - candidate PDF URL.
 * @param options - timeout and cancellation.
 * @returns the bytes and final URL, or `undefined`.
 */
export declare function fetchPdfBytes(url: string, options: {
    timeoutMs: number;
    signal?: AbortSignal | undefined;
}): Promise<PdfFetch | undefined>;
/** Successful download result. */
export interface DownloadSuccess {
    path: string;
    source: string;
    url: string;
    sizeBytes: number;
}
/** Failed download result: no free full text anywhere in the chain. */
export interface DownloadFailure {
    error: 'no-free-fulltext';
    triedSources: string[];
    /** One `level:host` entry per candidate URL that was fetched but rejected. */
    failures?: string[];
}
export type DownloadResult = DownloadSuccess | DownloadFailure;
/** One fallback level: a source label plus the URLs it wants to try. */
interface Level {
    label: string;
    urls: string[];
}
/**
 * Build the ordered fallback chain for one paper (DESIGN §9):
 * 1. known OA PDF (`openAccessPdfUrl` from the search sources — OpenAlex,
 *    Semantic Scholar, Europe PMC, CORE, DOAJ all fill this field),
 * 2. Unpaywall, 3. Semantic Scholar, 4. Europe PMC (both re-resolved live),
 * 5. arXiv / bioRxiv direct patterns, 6. OpenAIRE, 7. CORE,
 * 8. crossref_page landing meta, 9. publisher OA URL patterns,
 * 10. gray-area mirrors (only when enabled).
 * @param paper - the paper to resolve.
 * @param registry - the source registry.
 * @param signal - cancellation.
 * @returns the ordered levels that produced at least one candidate URL.
 */
/** The chain plus every level that was attempted (even those with no candidate). */
export interface FallbackChain {
    levels: Level[];
    /** Labels of every level consulted, in order — for diagnostics when levels is empty. */
    attempted: string[];
}
export declare function buildFallbackChain(paper: PaperMeta, registry: SourceRegistry, signal: AbortSignal): Promise<FallbackChain>;
/**
 * Resolve and download a paper's free PDF to `downloadDir`.
 * @param paper - the paper to download.
 * @param options - registry, directories, timeouts.
 * @param signal - cancellation.
 * @returns the saved file, or `{ error: 'no-free-fulltext', triedSources }`.
 */
export declare function downloadPaper(paper: PaperMeta, options: {
    registry: SourceRegistry;
    /** Download directory (already resolved against the workspace). */
    downloadDir: string;
    fetchOptions: () => FetchOptions;
    /** Per-download timeout in milliseconds. */
    pdfTimeoutMs: number;
    filename?: string | undefined;
    /** Optional browser downloader: retries failed direct fetches through a real page. */
    browser?: {
        fetchPdf(url: string, opts: {
            downloadDir: string;
            timeoutMs: number;
            signal?: AbortSignal | undefined;
        }): Promise<{
            data: Uint8Array;
            finalUrl: string;
        } | undefined>;
    } | undefined;
}, signal: AbortSignal): Promise<DownloadResult>;
export {};
