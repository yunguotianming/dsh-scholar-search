/**
 * crossref_page — resolve a DOI to its publisher landing page and mine the
 * `citation_pdf_url` meta tag. Only OA publishers expose that tag, so this
 * never circumvents a paywall; it just reads what the page already declares.
 * `resolvePdf` only.
 * @module dsh-scholar-search/sources/crossref_page
 */
import { fetchText, isHttpUrl, normalizeDoi } from '../http.js';
function htmlUrl(raw, baseUrl) {
    try {
        const url = new URL(raw.trim().replace(/&(?:amp|#38|#x26);/gi, '&'), baseUrl);
        return isHttpUrl(url.href) ? url.href : undefined;
    }
    catch {
        return undefined;
    }
}
/** Extract the `citation_pdf_url` meta content out of an HTML page. Exported for tests. */
export function citationPdfUrlFromHtml(html, baseUrl) {
    const metaRe = /<meta\b[^>]*>/gi;
    let m;
    while ((m = metaRe.exec(html)) !== null) {
        const tag = m[0];
        const nameMatch = /\bname\s*=\s*["']?citation_pdf_url["']?/i.exec(tag);
        if (nameMatch === null)
            continue;
        const contentMatch = /\bcontent\s*=\s*"([^"]+)"|\bcontent\s*=\s*'([^']+)'/i.exec(tag);
        const raw = contentMatch?.[1] ?? contentMatch?.[2];
        if (raw === undefined || raw.trim().length === 0)
            continue;
        const resolved = htmlUrl(raw, baseUrl);
        if (resolved !== undefined)
            return resolved;
    }
    return undefined;
}
/** 读取公开落地页声明的 PDF，或同站的机构库下载入口。 */
export function pdfLinksFromLandingPage(html, baseUrl) {
    const links = new Set();
    const citation = citationPdfUrlFromHtml(html, baseUrl);
    if (citation !== undefined)
        links.add(citation);
    const origin = new URL(baseUrl).origin;
    for (const match of html.matchAll(/<a\b[^>]*?\s+href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>(.*?)<\/a\s*>/gis)) {
        const resolved = htmlUrl(match[1] ?? match[2] ?? match[3] ?? '', baseUrl);
        if (resolved === undefined)
            continue;
        const url = new URL(resolved);
        if (url.origin !== origin)
            continue;
        const label = match[4] ?? '';
        if ((/\.pdf$/i.test(url.pathname) && /\b(?:pdf|download|full\s*text)\b|全文|下载/i.test(label)) ||
            /\/cgi\/viewcontent\.cgi$/i.test(url.pathname) ||
            /\/bitstreams\/[a-f\d-]{36}\/download\/?$/i.test(url.pathname))
            links.add(url.href);
    }
    return [...links];
}
/**
 * Create the crossref_page link-enrichment source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export function crossrefPageSource(options) {
    return {
        id: 'crossref_page',
        async search() {
            return [];
        },
        async resolvePdf(paper, signal) {
            const doi = normalizeDoi(paper.doi);
            if (doi === undefined)
                return undefined;
            const opts = options();
            const result = await fetchText(`https://doi.org/${encodeURI(doi)}`, {
                ...opts,
                headers: { 'Accept': 'text/html,*/*;q=0.8' },
                signal,
            });
            if (result === undefined)
                return undefined;
            // fetchText already validated the final URL stays http(s) after redirects.
            return citationPdfUrlFromHtml(result.body, result.finalUrl);
        },
    };
}
