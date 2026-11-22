/**
 * crossref_page — resolve a DOI to its publisher landing page and mine the
 * `citation_pdf_url` meta tag. Only OA publishers expose that tag, so this
 * never circumvents a paywall; it just reads what the page already declares.
 * `resolvePdf` only.
 * @module dsh-scholar-search/sources/crossref_page
 */
import type { FetchOptions } from '../http.js';
import type { ScholarSource } from '../types.js';
/** Extract the `citation_pdf_url` meta content out of an HTML page. Exported for tests. */
export declare function citationPdfUrlFromHtml(html: string, baseUrl: string): string | undefined;
/** 读取公开落地页声明的 PDF，或同站的机构库下载入口。 */
export declare function pdfLinksFromLandingPage(html: string, baseUrl: string): string[];
/**
 * Create the crossref_page link-enrichment source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export declare function crossrefPageSource(options: () => FetchOptions): ScholarSource;
