/**
 * grayarea — Sci-Hub 镜像默认可用，作为 OA 来源之后的最后下载兜底。
 * grayAreaMirrors 可配置带 {doi} 占位符的镜像 URL 模板。
 * @module dsh-scholar-search/sources/grayarea
 */
import type { FetchOptions } from '../http.js';
import type { ScholarSource } from '../types.js';
/**
 * Default mirror templates; `grayAreaMirrors` config replaces the whole list.
 * Updated for 2024-2025 active mirrors.
 */
export declare const DEFAULT_GRAYAREA_MIRRORS: string[];
/** A mirror probe result for diagnostics. */
export interface MirrorProbe {
    /** The mirror template host. */
    host: string;
    /** Whether the mirror page loaded and contained a PDF link. */
    ok: boolean;
    /** HTTP status or error kind. */
    status: string;
    /** Resolved PDF URL when found. */
    pdfUrl?: string;
    /** Latency in milliseconds. */
    latencyMs: number;
}
/** Extract a direct PDF link out of a Sci-Hub-style HTML page. Exported for tests. */
export declare function pdfUrlFromGrayAreaHtml(html: string, baseUrl: string): string | undefined;
/**
 * 创建默认可用的灰色渠道兜底源。
 * @param options - 共享请求选项。
 * @param mirrors - 每次调用读取的镜像 URL 模板。
 * @returns 灰色渠道兜底源。
 */
export declare function grayareaSource(options: () => FetchOptions, mirrors: () => string[]): ScholarSource;
/**
 * Sci-Hub 直接下载：分批并发探测镜像并返回第一个 PDF 链接。
 * 此函数直接请求镜像，不经过来源注册表的限流包装。
 * @param doi - normalized DOI.
 * @param mirrors - mirror URL templates.
 * @param opts - fetch options.
 * @returns the first PDF URL found, plus per-mirror diagnostics.
 */
export declare function scihubResolvePdf(doi: string, mirrors: string[], opts: FetchOptions): Promise<{
    pdfUrl: string | undefined;
    probes: MirrorProbe[];
}>;
/**
 * Ping a single mirror to check if it is reachable (for the settings card).
 * @param template - mirror URL template with `{doi}`.
 * @param opts - fetch options.
 * @returns reachability and latency.
 */
export declare function scihubPingMirror(template: string, opts: FetchOptions): Promise<{
    host: string;
    ok: boolean;
    latencyMs?: number;
    error?: string;
}>;
