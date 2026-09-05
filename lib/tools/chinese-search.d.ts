/**
 * CNKI、万方和维普的中文论文检索工具。
 * @module dsh-scholar-search/tools/chinese-search
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Runtime } from '../runtime.js';
import type { PaperMeta } from '../types.js';
export interface ChineseSearchValue {
    query: string;
    total: number;
    papers: PaperMeta[];
    searchedSources: string[];
    failedSources: string[];
    failureMessages: string[];
}
/** 注册中文三站点检索工具。 */
export declare function applyChineseSearchTools(ctx: Context, runtime: Runtime): void;
