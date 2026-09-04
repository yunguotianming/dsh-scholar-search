/**
 * grayarea — Sci-Hub mirrors as the LAST download fallback, enabled only when
 * the user explicitly sets `allowGrayArea: true`. Mirrors are configurable
 * (`grayAreaMirrors`), URL templates carry a `{doi}` placeholder. The legal
 * risk is the user's; see README.
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
 * Create the gray-area fallback source.
 * @param options - shared fetch options source.
 * @param enabled - whether `allowGrayArea` is on, read per call.
 * @param mirrors - mirror URL templates, read per call.
 * @returns the source.
 */
export declare function grayareaSource(options: () => FetchOptions, enabled: () => boolean, mirrors: () => string[]): ScholarSource;
/**
 * Direct Sci-Hub download: probe all mirrors concurrently and return the
 * first PDF link found. Unlike `grayareaSource.resolvePdf`, this is not
 * throttled and does not require `allowGrayArea` — the caller is expected to
 * have checked that.
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
