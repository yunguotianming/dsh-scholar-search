/**
 * DOAJ — the Directory of Open Access Journals. Free, no key. Every record is
 * OA by definition; `bibjson.link` carries the full-text URL.
 * @module dsh-scholar-search/sources/doaj
 */
import { fetchJson, isRecord, normalizeDoi, str } from '../http.js';
export const DOAJ_API = 'https://doaj.org/api/v2/search/articles';
/**
 * Map one DOAJ search result onto {@link PaperMeta}.
 * @param record - untyped result (a `bibjson` wrapper).
 * @returns the normalized paper, or `undefined` without a title.
 */
export function normalizeDoajArticle(record) {
    if (!isRecord(record))
        return undefined;
    const bibjson = isRecord(record.bibjson) ? record.bibjson : record;
    const title = str(bibjson, 'title');
    if (title === undefined)
        return undefined;
    let doi;
    if (Array.isArray(bibjson.identifier)) {
        for (const identifier of bibjson.identifier) {
            if (!isRecord(identifier))
                continue;
            if (str(identifier, 'type') === 'doi') {
                doi = normalizeDoi(str(identifier, 'id'));
                if (doi !== undefined)
                    break;
            }
        }
    }
    const authors = [];
    if (Array.isArray(bibjson.author)) {
        for (const author of bibjson.author) {
            if (!isRecord(author))
                continue;
            const name = str(author, 'name');
            if (name !== undefined)
                authors.push(name);
        }
    }
    const yearRaw = str(bibjson, 'year');
    const year = yearRaw !== undefined && /^\d{4}$/.test(yearRaw) ? Number.parseInt(yearRaw, 10) : undefined;
    const journal = isRecord(bibjson.journal) ? str(bibjson.journal, 'title') : undefined;
    let pdfUrl;
    let landing;
    if (Array.isArray(bibjson.link)) {
        for (const link of bibjson.link) {
            if (!isRecord(link))
                continue;
            const url = str(link, 'url');
            if (url === undefined)
                continue;
            const type = str(link, 'type');
            if (type === 'fulltext' && pdfUrl === undefined)
                pdfUrl = url;
            if (landing === undefined)
                landing = url;
        }
    }
    const id = str(record, 'id') ?? doi ?? title;
    const paper = { title, source: 'doaj', sourceId: id, isOpenAccess: true };
    if (authors.length > 0)
        paper.authors = authors;
    if (year !== undefined)
        paper.year = year;
    if (journal !== undefined)
        paper.venue = journal;
    const abstract = str(bibjson, 'abstract');
    if (abstract !== undefined)
        paper.abstract = abstract;
    if (doi !== undefined)
        paper.doi = doi;
    if (pdfUrl !== undefined)
        paper.openAccessPdfUrl = pdfUrl;
    if (landing !== undefined)
        paper.landingPageUrl = landing;
    else if (doi !== undefined)
        paper.landingPageUrl = `https://doi.org/${doi}`;
    return paper;
}
/**
 * Create the DOAJ source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export function doajSource(options) {
    return {
        id: 'doaj',
        async search(query, signal) {
            const opts = options();
            // The query rides the path; `pageSize` is the only query parameter.
            const url = `${DOAJ_API}/${encodeURIComponent(query.query)}?pageSize=${Math.min(Math.max(1, query.limit ?? 20), 100)}`;
            const data = await fetchJson(url, { ...opts, signal });
            if (!isRecord(data) || !Array.isArray(data.results))
                return [];
            let papers = data.results.map(normalizeDoajArticle).filter((p) => p !== undefined);
            if (query.yearFrom !== undefined)
                papers = papers.filter((p) => p.year === undefined || p.year >= query.yearFrom);
            if (query.yearTo !== undefined)
                papers = papers.filter((p) => p.year === undefined || p.year <= query.yearTo);
            return papers;
        },
    };
}
