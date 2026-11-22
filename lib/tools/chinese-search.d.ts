/**
 * CNKI、万方和维普的中文论文检索、详情读取与站内下载入口工具。
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
export { paperFromCnkiRecord } from '../chinese/cnki-mcp.js';
/** 注册中文检索、详情和下载入口工具。 */
export declare function applyChineseSearchTools(ctx: Context, runtime: Runtime): void;
