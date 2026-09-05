/**
 * dsh-scholar-search: free academic literature search + OA full-text download
 * for DeepSeek Harness. Registers scholar_search / scholar_download /
 * scholar_read on `ctx.tools`, a system-prompt guidance section, a settings
 * section (hot-updatable config), and `GET /scholar-search/ping` on the web
 * server for the settings card's connectivity checks.
 * @module dsh-scholar-search
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export type { PaperMeta, ScholarSource, SearchQuery } from './types.js';
export { normalizeTitle, paperKeys, mergePapers, mergePaperLists, scorePaper, mergeAndRank, SOURCE_QUALITY } from './paper.js';
export { downloadPaper, buildFallbackChain, pdfCandidatesFor, safeFilename, looksLikePdf, fetchPdfBytes } from './download.js';
export type { DownloadResult, DownloadSuccess, DownloadFailure } from './download.js';
export { extractPdfText, extractPdfFile, sliceText } from './pdf.js';
export { buildGuidance, SCHOLAR_GUIDANCE } from './prompt.js';
export * from './sources/index.js';
export { grayareaSource, pdfUrlFromGrayAreaHtml, DEFAULT_GRAYAREA_MIRRORS, scihubResolvePdf, scihubPingMirror } from './sources/grayarea.js';
export type { MirrorProbe } from './sources/grayarea.js';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "scholar-search";
/** Services required before `apply` runs; `settings` and `webServer` attach lazily. */
export declare const inject: string[];
/** Version string sent in the `User-Agent`; kept in sync with package.json. */
export declare const VERSION = "0.2.0";
export { PING_ROUTE, SETTINGS_NAMESPACE } from './shared/constants.js';
export type { PingResponse } from './shared/constants.js';
/** Plugin configuration; every field is optional and hot-updatable from the settings UI. */
export interface Config {
    /** Polite-pool email: required by Unpaywall, sent as `mailto` to OpenAlex/Crossref and in the User-Agent. */
    email?: string;
    /** Semantic Scholar API key (without one you share the public rate limit). */
    semanticScholarApiKey?: string;
    /** NCBI E-utilities API key (3 req/s without, 10 req/s with). */
    pubmedApiKey?: string;
    /** CORE API key (free registration); the CORE source is skipped without it. */
    coreApiKey?: string;
    /** SerpAPI key for Google Scholar (paid, free tier 100/month); the source is skipped without it. */
    googleScholarApiKey?: string;
    /** Enable gray-area mirrors (Sci-Hub) as the LAST download fallback. Off by default. Legal risk is yours — see README. */
    allowGrayArea?: boolean;
    /** Gray-area mirror URL templates with a `{doi}` placeholder; only used when allowGrayArea is true. */
    grayAreaMirrors?: string[];
    /** Directory PDFs download into (relative to the workspace, or absolute). Defaults to `download/papers` under the workspace. */
    downloadDir?: string;
    /** Search sources participating in scholar_search. */
    enabledSources?: string[];
    /** Per-source request timeout in milliseconds. */
    sourceTimeoutMs?: number;
    /** Per-download PDF timeout in milliseconds. */
    pdfTimeoutMs?: number;
    /** Cooperative per-tool-call budget in milliseconds. */
    toolTimeoutMs?: number;
    /** Default scholar_read slice length in characters. */
    readMaxChars?: number;
    /** Per-source minimum request intervals in milliseconds (overrides the defaults). */
    sourceMinIntervals?: Record<string, number>;
    /** Retry bot-blocked publisher downloads through a real browser (Playwright + system Chrome/Edge). */
    browserDownload?: boolean;
    /** Explicit browser executable path; absent probes the chrome/msedge channels. */
    browserExecutablePath?: string;
    /** Enable Chinese CNKI/Wanfang/CQVIP search support. */
    chineseSearchEnabled?: boolean;
    /** Enable lazy automatic startup of the local cnki-mcp HTTP service. */
    cnkiMcpAutoStart?: boolean;
    /** cnki-mcp Streamable HTTP endpoint. */
    cnkiMcpEndpoint?: string;
    /** Executable used to launch cnki-mcp, normally `uv`. */
    cnkiMcpExecutable?: string;
    /** cnki-mcp checkout directory used by automatic startup. */
    cnkiMcpProjectDir?: string;
    /** Maximum time to wait for an automatically started cnki-mcp service. */
    cnkiMcpStartupTimeoutMs?: number;
    /** Minimum interval between CNKI business calls. */
    cnkiMcpMinIntervalMs?: number;
}
export declare const Config: Schema<Config>;
/**
 * Validate the config, build the runtime, and register the tools, the prompt
 * section, the settings section, and the ping route. Every registration is an
 * effect on `ctx`, so disposing the plugin fiber unregisters everything.
 * @param ctx - plugin context with `tools` and `systemPrompt` ready.
 * @param config - schemastery-validated config with defaults applied.
 */
export declare function apply(ctx: Context, config: Config): void;
export { CnkiMcpManager } from './chinese/cnki-mcp.js';
export { ChineseBrowserWorkflow, isDetailUrl, parseSnapshot, providerFromUrl, resolveHref } from './chinese/browser-workflow.js';
export { applyChineseSearchTools } from './tools/chinese-search.js';
