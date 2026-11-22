import type { Runtime } from './runtime.js';
import type { PaperMeta } from './types.js';
export type SearchRuntime = Pick<Runtime, 'registry' | 'enabledSources'>;
interface SearchArguments {
    query: string;
    sources?: string[] | undefined;
    limit?: number | undefined;
    yearFrom?: number | undefined;
    yearTo?: number | undefined;
}
export interface SearchValue {
    query: string;
    total: number;
    papers: PaperMeta[];
    searchedSources: string[];
    failedSources?: string[];
}
export declare function compactPaper(paper: PaperMeta): PaperMeta;
/** DSH 和 MCP 共用检索源选择、去重和排序。 */
export declare function searchPapers(args: SearchArguments, runtime: SearchRuntime, signal: AbortSignal): Promise<SearchValue>;
export {};
