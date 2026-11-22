/**
 * Unpaywall — the authoritative DOI → OA PDF resolver. Free; requires an
 * email. `resolvePdf` only (it is not a search engine).
 * @module dsh-scholar-search/sources/unpaywall
 */
import { fetchJson, isHttpUrl, isRecord, normalizeDoi, str } from '../http.js';
export const UNPAYWALL_API = 'https://api.unpaywall.org/v2';
/** Extract the best OA PDF URL out of an Unpaywall record. Exported for tests. */
export function unpaywallPdfUrl(record) {
    return unpaywallPdfLocations(record).pdfUrls[0];
}
function unpaywallPdfLocations(record) {
    if (!isRecord(record))
        return { pdfUrls: [], landingUrls: [] };
    const locations = [record.best_oa_location, ...(Array.isArray(record.oa_locations) ? record.oa_locations : [])];
    const pdfUrls = new Set();
    const landingUrls = new Set();
    for (const location of locations) {
        if (!isRecord(location))
            continue;
        const pdf = str(location, 'url_for_pdf');
        const url = str(location, 'url');
        const landing = str(location, 'url_for_landing_page') ?? url;
        if (pdf !== undefined && isHttpUrl(pdf))
            pdfUrls.add(pdf);
        if (pdf === undefined && url !== undefined && isHttpUrl(url) && /\.pdf($|[?#])/i.test(url))
            pdfUrls.add(url);
        if (landing !== undefined && isHttpUrl(landing))
            landingUrls.add(landing);
    }
    return { pdfUrls: [...pdfUrls], landingUrls: [...landingUrls].filter((url) => !pdfUrls.has(url)) };
}
/**
 * Create the Unpaywall link-enrichment source.
 * @param options - shared fetch options source (must include the email).
 * @returns the source.
 */
export function unpaywallSource(options) {
    async function resolvePdfLocations(paper, signal) {
        const doi = normalizeDoi(paper.doi);
        const opts = options();
        if (doi === undefined || !opts.email)
            return { pdfUrls: [], landingUrls: [] };
        const data = await fetchJson(`${UNPAYWALL_API}/${encodeURIComponent(doi)}?email=${encodeURIComponent(opts.email)}`, { ...opts, signal });
        return unpaywallPdfLocations(data);
    }
    return {
        id: 'unpaywall',
        async search() {
            // Link-enrichment only; never part of the search fan-out.
            return [];
        },
        async resolvePdf(paper, signal) {
            return (await resolvePdfLocations(paper, signal)).pdfUrls[0];
        },
        resolvePdfLocations,
    };
}
