/**
 * Shared fetch helpers for every source adapter: timeout, a polite
 * `User-Agent` carrying the configured `mailto`, and degrade-to-empty
 * semantics — a source that answers 401/403/429, times out, or returns a
 * malformed body yields `undefined`, never a broken chain.
 * @module dsh-scholar-search/http
 */
/** Options every source call shares. */
export interface FetchOptions {
    /** Per-request timeout in milliseconds. */
    timeoutMs: number;
    /** Polite-pool email; rides the `User-Agent` as a `mailto:`. */
    email?: string | undefined;
    /** Extra headers (API keys, Accept overrides). */
    headers?: Record<string, string> | undefined;
    /** Caller cancellation. */
    signal?: AbortSignal | undefined;
}
/** Successful text fetch: the body and the final (post-redirect) URL. */
export interface TextResult {
    body: string;
    finalUrl: string;
}
/** Combine the caller signal with a fresh per-attempt timeout. */
export declare function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal;
/** `User-Agent` with the polite-pool email when configured. */
export declare function userAgent(email: string | undefined): string;
/**
 * Whether `url` uses an `http(s)` scheme. Every request this plugin makes —
 * and every redirect target a download lands on — must pass this check.
 */
export declare function isHttpUrl(url: string): boolean;
/**
 * GET `url` as text. Returns `undefined` on any HTTP status, transport error,
 * or timeout; only the caller's own abort rethrows.
 * @param url - absolute http(s) URL.
 * @param options - timeout, email, headers, cancellation.
 * @returns the body and final URL, or `undefined` when the source should be skipped.
 */
export declare function fetchText(url: string, options: FetchOptions): Promise<TextResult | undefined>;
/**
 * GET `url` as JSON. Returns `undefined` on any failure, including a body
 * that is not valid JSON.
 * @param url - absolute http(s) URL.
 * @param options - timeout, email, headers, cancellation.
 * @returns the parsed body, or `undefined` when the source should be skipped.
 */
export declare function fetchJson<T = unknown>(url: string, options: FetchOptions): Promise<T | undefined>;
/** Defensive object check for untyped API payloads. */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/** Read a string field off an untyped record. */
export declare function str(record: Record<string, unknown>, key: string): string | undefined;
/** Read a finite number field off an untyped record. */
export declare function num(record: Record<string, unknown>, key: string): number | undefined;
/** Read a boolean field off an untyped record. */
export declare function bool(record: Record<string, unknown>, key: string): boolean | undefined;
/**
 * Strip the `https?://(dx.)?doi.org/` prefix and lowercase a DOI, or return
 * `undefined` for anything that does not look like one.
 */
export declare function normalizeDoi(value: string | undefined): string | undefined;
/** Strip an arXiv id of its `arxiv:` prefix, abs/pdf URL form, `.pdf`, and version suffix. */
export declare function normalizeArxivId(value: string | undefined): string | undefined;
/** Strip a `PMC` prefix down to the bare digits, or `undefined`. */
export declare function normalizePmcid(value: string | undefined): string | undefined;
/** Bare digits PMID, or `undefined`. */
export declare function normalizePmid(value: string | undefined): string | undefined;
