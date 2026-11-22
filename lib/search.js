import { mergeAndRank } from './paper.js';
import { SEARCH_SOURCE_IDS } from './sources/index.js';
export function compactPaper(paper) {
    const out = {};
    for (const [key, value] of Object.entries(paper)) {
        if (value !== undefined)
            out[key] = value;
    }
    return out;
}
/** DSH 和 MCP 共用检索源选择、去重和排序。 */
export async function searchPapers(args, runtime, signal) {
    const query = args.query.trim();
    if (query.length === 0)
        throw new Error('query must be a non-empty string');
    const limit = Math.min(Math.max(1, Math.trunc(args.limit ?? 20)), 50);
    const enabled = runtime.enabledSources();
    const requested = args.sources?.map((id) => id.trim().toLowerCase().replace(/-/g, '_')).filter((id) => id.length > 0);
    const unknown = requested?.filter((id) => !SEARCH_SOURCE_IDS.includes(id)) ?? [];
    if (unknown.length > 0)
        throw new Error(`未知检索源：${unknown.join(', ')}；可选：${SEARCH_SOURCE_IDS.join(', ')}`);
    const sources = runtime.registry.searchSources.filter((source) => enabled.includes(source.id) && (!requested?.length || requested.includes(source.id)));
    if (sources.length === 0)
        throw new Error('所选检索源均未启用，请检查 sources 和插件设置');
    const results = await Promise.allSettled(sources.map((source) => source.search({
        query,
        limit: Math.max(limit, 10),
        ...(args.yearFrom !== undefined ? { yearFrom: Math.trunc(args.yearFrom) } : {}),
        ...(args.yearTo !== undefined ? { yearTo: Math.trunc(args.yearTo) } : {}),
    }, signal)));
    signal.throwIfAborted();
    const lists = [];
    const failedSources = [];
    for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled')
            lists.push(result.value);
        else
            failedSources.push(sources[index].id);
    }
    const papers = mergeAndRank(lists, limit, new Date().getFullYear()).map(compactPaper);
    return {
        query, total: papers.length, papers, searchedSources: sources.map((source) => source.id),
        ...(failedSources.length > 0 ? { failedSources } : {}),
    };
}
