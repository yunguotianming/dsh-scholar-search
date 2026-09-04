/**
 * bioRxiv and medRxiv via api.biorxiv.org. Free, no key. The API browses by
 * category and date rather than free text, so `search` filters recent
 * category listings client-side by title/abstract match.
 * @module dsh-scholar-search/sources/biorxiv
 */
import { fetchJson, isRecord, normalizeDoi, str } from '../http.js';
const LABEL = { biorxiv: 'bioRxiv', medrxiv: 'medRxiv' };
const LOOKBACK_DAYS = 180;
/**
 * Map one `collection[]` record onto {@link PaperMeta}.
 * @param record - untyped item.
 * @param server - which server it came from.
 * @returns the normalized paper, or `undefined` without DOI or title.
 */
export function normalizeRxivPaper(record, server) {
    if (!isRecord(record))
        return undefined;
    const doi = normalizeDoi(str(record, 'doi'));
    const title = str(record, 'title');
    if (doi === undefined || title === undefined)
        return undefined;
    const version = str(record, 'version') ?? '1';
    const authors = (str(record, 'authors') ?? '').split(';').map((a) => a.trim()).filter((a) => a.length > 0);
    const date = str(record, 'date');
    const yearMatch = date !== undefined ? /^(\d{4})/.exec(date) : null;
    const paper = {
        title,
        source: 'biorxiv',
        sourceId: `${server}:${doi}`,
        doi,
        isOpenAccess: true,
        openAccessPdfUrl: `https://www.${server}.org/content/${doi}v${version}.full.pdf`,
        landingPageUrl: `https://www.${server}.org/content/${doi}v${version}`,
        venue: LABEL[server],
    };
    if (authors.length > 0)
        paper.authors = authors;
    if (yearMatch !== null)
        paper.year = Number.parseInt(yearMatch[1], 10);
    const abstract = str(record, 'abstract');
    if (abstract !== undefined)
        paper.abstract = abstract;
    return paper;
}
/** Whether a paper matches the free-text query (client-side filter). */
function matchesQuery(paper, terms) {
    if (terms.length === 0)
        return true;
    const haystack = `${paper.title} ${paper.abstract ?? ''}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
}
/**
 * Create the combined bioRxiv/medRxiv source. Because the upstream API has no
 * free-text search, `search` fetches the last {@link LOOKBACK_DAYS} days of
 * both servers and filters client-side — expect fewer and fuzzier hits than
 * the indexed sources.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export function biorxivSource(options) {
    return {
        id: 'biorxiv',
        async search(query, signal) {
            const opts = options();
            const terms = query.query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
            const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
            const now = new Date();
            const start = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
            const fmt = (d) => d.toISOString().slice(0, 10);
            const papers = [];
            for (const server of ['biorxiv', 'medrxiv']) {
                let cursor = 0;
                // A few pages per server is enough for a filtered browse.
                for (let page = 0; page < 5 && papers.length < limit * 2; page++) {
                    const url = `https://api.biorxiv.org/details/${server}/${fmt(start)}/${fmt(now)}/${cursor}`;
                    const data = await fetchJson(url, { ...opts, signal });
                    if (!isRecord(data) || !Array.isArray(data.collection) || data.collection.length === 0)
                        break;
                    for (const item of data.collection) {
                        const paper = normalizeRxivPaper(item, server);
                        if (paper === undefined || !matchesQuery(paper, terms))
                            continue;
                        if (query.yearFrom !== undefined && paper.year !== undefined && paper.year < query.yearFrom)
                            continue;
                        if (query.yearTo !== undefined && paper.year !== undefined && paper.year > query.yearTo)
                            continue;
                        papers.push(paper);
                    }
                    if (data.collection.length < 100)
                        break;
                    cursor += 100;
                }
            }
            return papers.slice(0, limit);
        },
        async resolvePdf(paper) {
            // bioRxiv/medRxiv DOIs map straight onto the full-text PDF pattern.
            const doi = normalizeDoi(paper.doi);
            if (doi === undefined)
                return undefined;
            if (!/^10\.(1101|64898)\//.test(doi))
                return undefined;
            const server = paper.sourceId.startsWith('medrxiv:') || /medrxiv/i.test(paper.landingPageUrl ?? '') ? 'medrxiv' : 'biorxiv';
            return `https://www.${server}.org/content/${doi}v1.full.pdf`;
        },
    };
}
