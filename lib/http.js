/**
 * Shared fetch helpers for every source adapter: timeout, a polite
 * `User-Agent` carrying the configured `mailto`, and degrade-to-empty
 * semantics — a source that answers 401/403/429, times out, or returns a
 * malformed body yields `undefined`, never a broken chain.
 * @module dsh-scholar-search/http
 */
/** Whether `error` is the caller's own abort (rethrown, never swallowed). */
function isCallerAbort(error, signal) {
    return signal?.aborted === true && error instanceof Error && error.name === 'AbortError';
}
/** Combine the caller signal with a fresh per-attempt timeout. */
export function requestSignal(signal, timeoutMs) {
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (signal !== undefined)
        signals.push(signal);
    return AbortSignal.any(signals);
}
/** `User-Agent` with the polite-pool email when configured. */
export function userAgent(email) {
    const base = 'dsh-scholar-search/0.0.1 (+https://github.com/deepseek-ai/deepseek-harness)';
    return email !== undefined && email.length > 0 ? `${base}; mailto:${email}` : base;
}
/**
 * Whether `url` uses an `http(s)` scheme. Every request this plugin makes —
 * and every redirect target a download lands on — must pass this check.
 */
export function isHttpUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    }
    catch {
        return false;
    }
}
/**
 * GET `url` as text. Returns `undefined` on any HTTP status, transport error,
 * or timeout; only the caller's own abort rethrows.
 * @param url - absolute http(s) URL.
 * @param options - timeout, email, headers, cancellation.
 * @returns the body and final URL, or `undefined` when the source should be skipped.
 */
export async function fetchText(url, options) {
    if (!isHttpUrl(url))
        return undefined;
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            headers: {
                'User-Agent': userAgent(options.email),
                'Accept': 'application/json, application/atom+xml, text/xml, text/html, */*',
                ...options.headers,
            },
            signal: requestSignal(options.signal, options.timeoutMs),
        });
        if (!res.ok)
            return undefined;
        const finalUrl = res.url.length > 0 ? res.url : url;
        // A redirect must never escape the http(s) family.
        if (!isHttpUrl(finalUrl))
            return undefined;
        return { body: await res.text(), finalUrl };
    }
    catch (error) {
        if (isCallerAbort(error, options.signal))
            throw error;
        return undefined;
    }
}
/**
 * GET `url` as JSON. Returns `undefined` on any failure, including a body
 * that is not valid JSON.
 * @param url - absolute http(s) URL.
 * @param options - timeout, email, headers, cancellation.
 * @returns the parsed body, or `undefined` when the source should be skipped.
 */
export async function fetchJson(url, options) {
    const text = await fetchText(url, options);
    if (text === undefined)
        return undefined;
    try {
        return JSON.parse(text.body);
    }
    catch {
        return undefined;
    }
}
/** Defensive object check for untyped API payloads. */
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Read a string field off an untyped record. */
export function str(record, key) {
    const value = record[key];
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
/** Read a finite number field off an untyped record. */
export function num(record, key) {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
/** Read a boolean field off an untyped record. */
export function bool(record, key) {
    const value = record[key];
    return typeof value === 'boolean' ? value : undefined;
}
/**
 * Strip the `https?://(dx.)?doi.org/` prefix and lowercase a DOI, or return
 * `undefined` for anything that does not look like one.
 */
export function normalizeDoi(value) {
    if (value === undefined)
        return undefined;
    const stripped = value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/\/+$/, '').trim();
    return /^10\.\d{4,9}\/\S+$/.test(stripped) ? stripped.toLowerCase() : undefined;
}
/** Strip an arXiv id of its `arxiv:` prefix, abs/pdf URL form, `.pdf`, and version suffix. */
export function normalizeArxivId(value) {
    if (value === undefined)
        return undefined;
    const trimmed = value.trim()
        .replace(/^arxiv:/i, '')
        .replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, '')
        .replace(/\.pdf$/i, '')
        .replace(/v\d+$/i, '');
    return /^([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})$/i.test(trimmed) ? trimmed : undefined;
}
/** Strip a `PMC` prefix down to the bare digits, or `undefined`. */
export function normalizePmcid(value) {
    if (value === undefined)
        return undefined;
    const digits = value.trim().replace(/^PMC/i, '');
    return /^\d+$/.test(digits) ? `PMC${digits}` : undefined;
}
/** Bare digits PMID, or `undefined`. */
export function normalizePmid(value) {
    if (value === undefined)
        return undefined;
    const trimmed = value.trim().replace(/^https?:\/\/(?:www\.)?ncbi\.nlm\.nih\.gov\/pubmed\//i, '');
    return /^\d+$/.test(trimmed) ? trimmed : undefined;
}
