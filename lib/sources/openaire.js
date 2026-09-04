/**
 * OpenAIRE — the European OA aggregator. Free, no key. `resolvePdf` only:
 * full-text links are mined from the record's `instance[]` nodes, with
 * low-value URLs (OpenAIRE metadata pages, Google links) filtered out —
 * the same convention as QwenPaw local_paper_hub's providers_oa_discovery.
 * @module dsh-scholar-search/sources/openaire
 */
import { fetchText, isHttpUrl, isRecord, normalizeDoi } from '../http.js';
export const OPENAIRE_API = 'https://api.openaire.eu/search/publications';
/** Whether a URL points at an OpenAIRE metadata page or another known-low-value host. */
export function isLowValueUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return true;
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'google.com' || host === 'www.google.com')
        return true;
    // OpenAIRE's own detail pages are metadata, not full text.
    if ((host === 'explore.openaire.eu' || host === 'api.openaire.eu'))
        return true;
    return false;
}
/** Whether a URL looks like it serves a PDF. */
export function isPdfishUrl(url) {
    try {
        const parsed = new URL(url);
        const path = parsed.pathname.toLowerCase();
        return path.endsWith('.pdf') || path.includes('/pdf') || parsed.search.toLowerCase().includes('pdf') || path.includes('download');
    }
    catch {
        return false;
    }
}
/**
 * Mine full-text URLs out of an OpenAIRE JSON record's `instance[]` nodes.
 * The OpenAIRE JSON flavour nests values as `{ $: string }` leaves.
 * @param node - any node of the parsed record.
 * @param out - accumulating candidate URLs (http(s), not low-value).
 */
function collectInstanceUrls(node, out) {
    if (Array.isArray(node)) {
        for (const item of node)
            collectInstanceUrls(item, out);
        return;
    }
    if (!isRecord(node))
        return;
    // Leaf value: { $: "https://…" }
    const leaf = node.$;
    if (typeof leaf === 'string' && isHttpUrl(leaf) && !isLowValueUrl(leaf))
        out.push(leaf);
    for (const [key, value] of Object.entries(node)) {
        if (key === 'fulltext' || key === 'url' || key === 'webresource')
            collectInstanceUrls(value, out);
        else if (isRecord(value) || Array.isArray(value)) {
            // Only recurse into instance-ish subtrees to bound the walk.
            if (key === 'instance' || key === 'children')
                collectInstanceUrls(value, out);
        }
    }
}
/**
 * Resolve a DOI to OpenAIRE full-text candidates, best (PDF-looking) first.
 * @param doi - bare DOI.
 * @param options - fetch options.
 * @param signal - cancellation.
 * @returns candidate URLs, possibly empty.
 */
export async function openaireCandidates(doi, options, signal) {
    const params = new URLSearchParams({ doi, format: 'json', size: '1' });
    const result = await fetchText(`${OPENAIRE_API}?${params.toString()}`, { ...options, signal });
    if (result === undefined)
        return [];
    let data;
    try {
        data = JSON.parse(result.body);
    }
    catch {
        return [];
    }
    const candidates = [];
    collectInstanceUrls(data, candidates);
    const unique = [...new Set(candidates)];
    unique.sort((a, b) => Number(isPdfishUrl(b)) - Number(isPdfishUrl(a)));
    return unique.slice(0, 5);
}
/**
 * Create the OpenAIRE link-enrichment source.
 * @param options - shared fetch options source.
 * @returns the source.
 */
export function openaireSource(options) {
    return {
        id: 'openaire',
        async search() {
            return [];
        },
        async resolvePdf(paper, signal) {
            const doi = normalizeDoi(paper.doi);
            if (doi === undefined)
                return undefined;
            const candidates = await openaireCandidates(doi, options(), signal);
            return candidates.find(isPdfishUrl) ?? candidates[0];
        },
    };
}
