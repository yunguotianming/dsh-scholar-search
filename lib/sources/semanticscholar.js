/**
 * Semantic Scholar Graph API. Free; an optional API key lifts the shared
 * rate limit. `openAccessPdf.url` carries the OA link.
 * @module dsh-scholar-search/sources/semanticscholar
 */
import { fetchJson, isRecord, normalizeArxivId, normalizeDoi, normalizePmcid, normalizePmid, num, str } from '../http.js';
export const S2_API = 'https://api.semanticscholar.org/graph/v1/paper';
const FIELDS = 'paperId,title,abstract,year,venue,authors,externalIds,citationCount,isOpenAccess,openAccessPdf,url';
/**
 * Map one Semantic Scholar paper record onto {@link PaperMeta}.
 * @param record - untyped record.
 * @returns the normalized paper, or `undefined` without a title.
 */
export function normalizeS2Paper(record) {
    if (!isRecord(record))
        return undefined;
    const title = str(record, 'title');
    if (title === undefined)
        return undefined;
    const ids = isRecord(record.externalIds) ? record.externalIds : {};
    const doi = normalizeDoi(str(ids, 'DOI'));
    const arxivId = normalizeArxivId(str(ids, 'ArXiv'));
    const pmid = normalizePmid(str(ids, 'PubMed'));
    const pmcid = normalizePmcid(str(ids, 'PubMedCentral'));
    const authors = [];
    if (Array.isArray(record.authors)) {
        for (const author of record.authors) {
            if (!isRecord(author))
                continue;
            const name = str(author, 'name');
            if (name !== undefined)
                authors.push(name);
        }
    }
    const oaPdf = isRecord(record.openAccessPdf) ? str(record.openAccessPdf, 'url') : undefined;
    const year = num(record, 'year');
    const paper = {
        title,
        source: 'semantic_scholar',
        sourceId: str(record, 'paperId') ?? doi ?? arxivId ?? title,
    };
    if (authors.length > 0)
        paper.authors = authors;
    if (year !== undefined)
        paper.year = Math.trunc(year);
    const venue = str(record, 'venue');
    if (venue !== undefined)
        paper.venue = venue;
    const abstract = str(record, 'abstract');
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
    const citations = num(record, 'citationCount');
    if (citations !== undefined)
        paper.citationCount = Math.trunc(citations);
    if (record.isOpenAccess === true)
        paper.isOpenAccess = true;
    if (oaPdf !== undefined)
        paper.openAccessPdfUrl = oaPdf;
    const url = str(record, 'url');
    if (url !== undefined)
        paper.landingPageUrl = url;
    return paper;
}
/**
 * Create the Semantic Scholar source.
 * @param options - shared fetch options source.
 * @param apiKey - optional API key read per call.
 * @returns the source.
 */
export function semanticScholarSource(options, apiKey) {
    const headers = () => {
        const key = apiKey();
        return key !== undefined && key.length > 0 ? { 'x-api-key': key } : {};
    };
    return {
        id: 'semantic_scholar',
        async search(query, signal) {
            const opts = options();
            const params = new URLSearchParams({
                query: query.query,
                limit: String(Math.min(Math.max(1, query.limit ?? 20), 100)),
                fields: FIELDS,
            });
            const data = await fetchJson(`${S2_API}/search?${params.toString()}`, { ...opts, headers: headers(), signal });
            if (!isRecord(data) || !Array.isArray(data.data))
                return [];
            let papers = data.data.map(normalizeS2Paper).filter((p) => p !== undefined);
            if (query.yearFrom !== undefined)
                papers = papers.filter((p) => p.year === undefined || p.year >= query.yearFrom);
            if (query.yearTo !== undefined)
                papers = papers.filter((p) => p.year === undefined || p.year <= query.yearTo);
            return papers;
        },
        async resolvePdf(paper, signal) {
            // Re-read by the strongest identifier; the search path already carries openAccessPdf.
            const doi = normalizeDoi(paper.doi);
            const arxivId = normalizeArxivId(paper.arxivId);
            const ref = doi !== undefined ? `DOI:${doi}` : arxivId !== undefined ? `ARXIV:${arxivId}` : undefined;
            if (ref === undefined)
                return undefined;
            const opts = options();
            const params = new URLSearchParams({ fields: 'openAccessPdf,isOpenAccess' });
            const data = await fetchJson(`${S2_API}/${encodeURIComponent(ref)}?${params.toString()}`, { ...opts, headers: headers(), signal });
            if (!isRecord(data))
                return undefined;
            const oaPdf = isRecord(data.openAccessPdf) ? str(data.openAccessPdf, 'url') : undefined;
            return oaPdf;
        },
    };
}
