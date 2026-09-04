/**
 * Unpaywall — the authoritative DOI → OA PDF resolver. Free; requires an
 * email. `resolvePdf` only (it is not a search engine).
 * @module dsh-scholar-search/sources/unpaywall
 */
import { fetchJson, isRecord, normalizeDoi, str } from '../http.js';
export const UNPAYWALL_API = 'https://api.unpaywall.org/v2';
/** Extract the best OA PDF URL out of an Unpaywall record. Exported for tests. */
export function unpaywallPdfUrl(record) {
    if (!isRecord(record))
        return undefined;
    const best = isRecord(record.best_oa_location) ? record.best_oa_location : undefined;
    const bestPdf = best !== undefined ? str(best, 'url_for_pdf') : undefined;
    if (bestPdf !== undefined)
        return bestPdf;
    if (Array.isArray(record.oa_locations)) {
        for (const loc of record.oa_locations) {
            if (!isRecord(loc))
                continue;
            const pdf = str(loc, 'url_for_pdf');
            if (pdf !== undefined)
                return pdf;
        }
        // Fall back to the best OA landing page's url (often a repository PDF).
        if (best !== undefined) {
            const url = str(best, 'url');
            if (url !== undefined && /\.pdf($|[?#])/i.test(url))
                return url;
        }
    }
    return undefined;
}
/**
 * Create the Unpaywall link-enrichment source.
 * @param options - shared fetch options source (must include the email).
 * @returns the source.
 */
export function unpaywallSource(options) {
    return {
        id: 'unpaywall',
        async search() {
            // Link-enrichment only; never part of the search fan-out.
            return [];
        },
        async resolvePdf(paper, signal) {
            const doi = normalizeDoi(paper.doi);
            if (doi === undefined)
                return undefined;
            const opts = options();
            if (opts.email === undefined || opts.email.length === 0)
                return undefined;
            const data = await fetchJson(`${UNPAYWALL_API}/${encodeURIComponent(doi)}?email=${encodeURIComponent(opts.email)}`, { ...opts, signal });
            return unpaywallPdfUrl(data);
        },
    };
}
