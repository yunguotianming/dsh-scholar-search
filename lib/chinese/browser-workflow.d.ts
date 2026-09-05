/**
 * 使用现有 dsh-browser 工具完成万方和维普检索。
 * @module dsh-scholar-search/chinese/browser-workflow
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { PaperMeta } from '../types.js';
export type ChineseBrowserProvider = 'wanfang' | 'cqvip';
interface SnapshotItem {
    index: number;
    name: string;
    href?: string;
}
interface Snapshot {
    url: string;
    title: string;
    main: string;
    items: SnapshotItem[];
}
export declare function parseSnapshot(text: string): Snapshot;
export declare function resolveHref(href: string, pageUrl: string): string | undefined;
export declare function isDetailUrl(provider: ChineseBrowserProvider, url: string): boolean;
/** 在同一 agent 上以内嵌子调用方式调用 dsh-browser 工具。 */
export declare class ChineseBrowserWorkflow {
    private readonly ctx;
    private sequence;
    constructor(ctx: Context);
    private call;
    search(provider: ChineseBrowserProvider, query: string, limit: number, exec: ToolRunContext): Promise<PaperMeta[]>;
    detail(provider: ChineseBrowserProvider, url: string, exec: ToolRunContext): Promise<PaperMeta>;
}
export declare function providerFromUrl(url: string): ChineseBrowserProvider | undefined;
export {};
