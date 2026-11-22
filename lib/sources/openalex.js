/**
 * OpenAlex — the search backbone. Free, no key; pass `mailto` for the polite
 * pool. Abstracts arrive as `abstract_inverted_index` (word → positions) and
 * must be rebuilt into prose here.
 * @module dsh-scholar-search/sources/openalex
 */
import { fetchJson, isHttpUrl, isRecord, normalizeArxivId, normalizeDoi, normalizePmcid, normalizePmid, num, str } from '../http.js';
export const OPENALEX_API = 'https://api.openalex.org/works';
/**
 * Rebuild prose from OpenAlex's `abstract_inverted_index` (word → list of
 * positions). Returns `undefined` when the index is absent or empty.
 * @param index - the raw inverted index.
 * @returns the rebuilt abstract.
 */
export function rebuildAbstract(index) {
    if (!isRecord(index))
        return undefined;
    const tokens = new Map();
    for (const [word, positions] of Object.entries(index)) {
        if (!Array.isArray(positions))
            continue;
        for (const pos of positions) {
            if (typeof pos !== 'number' || !Number.isInteger(pos) || pos < 0)
                continue;
            if (!tokens.has(pos))
                tokens.set(pos, word);
        }
    }
    if (tokens.size === 0)
        return undefined;
    const ordered = [...tokens.keys()].sort((a, b) => a - b).map((pos) => tokens.get(pos));
    return ordered.join(' ').replace(/\s+/g, ' ').trim() || undefined;
}
/**
 * Map one OpenAlex `work` record onto {@link PaperMeta}.
 * @param work - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export function normalizeOpenAlexWork(work) {
    if (!isRecord(work))
        return undefined;
    const title = str(work, 'title') ?? str(work, 'display_name');
    if (title === undefined)
        return undefined;
    const rawId = str(work, 'id') ?? '';
    const sourceId = rawId.startsWith('https://openalex.org/') ? rawId.slice('https://openalex.org/'.length) : rawId;
    const ids = isRecord(work.ids) ? work.ids : {};
    const doi = normalizeDoi(str(work, 'doi') ?? str(ids, 'doi'));
    const pmid = normalizePmid(str(ids, 'pmid'));
    const pmcid = normalizePmcid(str(ids, 'pmcid'));
    const arxivId = (() => {
        // OpenAlex surfaces arXiv ids under locations' landing/pdf URLs and ids.mag rarely; scan locations.
        const locations = Array.isArray(work.locations) ? work.locations : [];
        for (const loc of locations) {
            if (!isRecord(loc))
                continue;
            const landing = str(loc, 'landing_page_url');
            if (landing !== undefined) {
                const m = /arxiv\.org\/abs\/([^\s?#]+)/i.exec(landing);
                if (m !== null)
                    return normalizeArxivId(m[1]);
            }
        }
        return undefined;
    })();
    const oa = isRecord(work.open_access) ? work.open_access : {};
    const isOpenAccess = oa.is_oa === true;
    const bestLocation = isRecord(work.best_oa_location) ? work.best_oa_location : undefined;
    const openAccessPdfUrl = (() => {
        const bestPdf = bestLocation !== undefined ? str(bestLocation, 'pdf_url') : undefined;
        if (bestPdf !== undefined)
            return bestPdf;
        const locations = Array.isArray(work.locations) ? work.locations : [];
        for (const loc of locations) {
            if (!isRecord(loc))
                continue;
            const pdf = str(loc, 'pdf_url');
            if (pdf !== undefined)
                return pdf;
        }
        const oaUrl = str(oa, 'oa_url');
        return oaUrl !== undefined && /\.pdf($|[?#])/i.test(oaUrl) ? oaUrl : undefined;
    })();
    const authors = [];
    if (Array.isArray(work.authorships)) {
        for (const authorship of work.authorships) {
            if (!isRecord(authorship) || !isRecord(authorship.author))
                continue;
            const name = str(authorship.author, 'display_name');
            if (name !== undefined)
                authors.push(name);
        }
    }
    const primary = isRecord(work.primary_location) ? work.primary_location : undefined;
    const source = primary !== undefined && isRecord(primary.source) ? primary.source : undefined;
    const venue = source !== undefined ? str(source, 'display_name') : undefined;
    const landingPageUrl = (bestLocation !== undefined ? str(bestLocation, 'landing_page_url') : undefined)
        ?? (primary !== undefined ? str(primary, 'landing_page_url') : undefined)
        ?? (doi !== undefined ? `https://doi.org/${doi}` : undefined)
        ?? rawId;
    const year = num(work, 'publication_year');
    const paper = { title, source: 'openalex', sourceId };
    if (authors.length > 0)
        paper.authors = authors;
    if (year !== undefined)
        paper.year = Math.trunc(year);
    if (venue !== undefined)
        paper.venue = venue;
    const abstract = rebuildAbstract(work.abstract_inverted_index);
    if (abstract !== undefined)
        paper.abstract = abstract;
    if (doi !== undefined)
        paper.doi = doi;
    if (arxivId !== undefined)
        paper.arxivId = arxivId;
    if (pmid !== undefined)
        paper.pmid = pmid;
    if (pmcid !== undefined)
        paper.pmcid = pmcid;
    const citations = num(work, 'cited_by_count');
    if (citations !== undefined)
        paper.citationCount = Math.trunc(citations);
    paper.isOpenAccess = isOpenAccess;
    if (openAccessPdfUrl !== undefined)
        paper.openAccessPdfUrl = openAccessPdfUrl;
    if (landingPageUrl !== undefined && landingPageUrl.length > 0)
        paper.landingPageUrl = landingPageUrl;
    return paper;
}
/**
 * Collect every OA PDF candidate from an OpenAlex work: all `locations[].pdf_url`
 * (institutional repositories, content proxies, publisher OA PDFs — in that
 * order of preference) plus the `content_urls.pdf` OpenAlex content proxy.
 * Exported for tests and for the download chain's multi-candidate use.
 * @param work - untyped record.
 * @returns candidate URLs, best first, deduplicated.
 */
export function openAlexPdfCandidates(work) {
    if (!isRecord(work))
        return [];
    const out = [];
    const seen = new Set();
    const push = (url) => {
        if (url === undefined || !isHttpUrl(url) || seen.has(url))
            return;
        seen.add(url);
        out.push(url);
    };
    if (Array.isArray(work.locations)) {
        for (const loc of work.locations) {
            if (!isRecord(loc) || loc.is_oa === false)
                continue;
            push(str(loc, 'pdf_url'));
        }
    }
    const best = isRecord(work.best_oa_location) ? work.best_oa_location : undefined;
    if (best !== undefined && best.is_oa !== false)
        push(str(best, 'pdf_url'));
    // OpenAlex's own content proxy (content.openalex.org) — a full-text mirror
    // that the field report found under-used by the download chain.
    const contentUrls = isRecord(work.content_urls) ? work.content_urls : undefined;
    if (contentUrls !== undefined)
        push(str(contentUrls, 'pdf'));
    return out;
}
/**
 * Create the OpenAlex source.
 * @param options - shared fetch options source (email + timeout read per call).
 * @returns the source.
 */
export function openAlexSource(options) {
    async function resolvePdfLocations(paper, signal) {
        const doi = normalizeDoi(paper.doi);
        if (doi === undefined)
            return { pdfUrls: [], landingUrls: [] };
        const opts = options();
        const params = new URLSearchParams({ filter: `doi:${doi}` });
        if (opts.email)
            params.set('mailto', opts.email);
        const data = await fetchJson(`${OPENALEX_API}?${params.toString()}`, { ...opts, signal });
        const work = isRecord(data) && Array.isArray(data.results) ? data.results[0] : undefined;
        if (!isRecord(work))
            return { pdfUrls: [], landingUrls: [] };
        const locations = [work.best_oa_location, ...(Array.isArray(work.locations) ? work.locations : [])];
        const landingUrls = new Set();
        for (const location of locations) {
            if (!isRecord(location) || location.is_oa === false || (location.is_oa !== true && location !== work.best_oa_location))
                continue;
            const url = str(location, 'landing_page_url');
            if (url !== undefined && isHttpUrl(url))
                landingUrls.add(url);
        }
        return { pdfUrls: openAlexPdfCandidates(work), landingUrls: [...landingUrls] };
    }
    return {
        id: 'openalex',
        async search(query, signal) {
            const opts = options();
            const params = new URLSearchParams({
                search: query.query,
                'per-page': String(Math.min(Math.max(1, query.limit ?? 20), 200)),
            });
            if (query.yearFrom !== undefined || query.yearTo !== undefined) {
                const from = query.yearFrom ?? 1600;
                const to = query.yearTo ?? 9999;
                params.set('filter', `publication_year:${from}-${to}`);
            }
            if (opts.email !== undefined && opts.email.length > 0)
                params.set('mailto', opts.email);
            const data = await fetchJson(`${OPENALEX_API}?${params.toString()}`, { ...opts, signal });
            if (!isRecord(data) || !Array.isArray(data.results))
                return [];
            return data.results.map(normalizeOpenAlexWork).filter((p) => p !== undefined);
        },
        async resolvePdf(paper, signal) {
            return (await resolvePdfLocations(paper, signal)).pdfUrls[0];
        },
        resolvePdfLocations,
    };
}
