/**
 * 使用现有 dsh-browser 工具完成万方、维普的详情抽取，以及 CNKI、万方、维普的
 * 站内下载链接解析。工具只读取站点自身提供的下载入口并把它交给用户的浏览器，
 * 不在插件进程里抓取受限全文，也不绕过登录、订阅或验证码。
 * @module dsh-scholar-search/chinese/browser-workflow
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { PaperMeta } from '../types.js';
/** 三个中文库的标识；下载链接解析覆盖 CNKI。 */
export type ChineseProvider = 'cnki' | 'wanfang' | 'cqvip';
/** 由浏览器工作流直接检索和读取详情的站点。 */
export type ChineseBrowserProvider = Extract<ChineseProvider, 'wanfang' | 'cqvip'>;
/** 详情页中承载下载入口的区域，按优先级依次尝试。 */
export declare const DOWNLOAD_REGIONS: Record<ChineseProvider, string[]>;
/** 快照中的一个交互元素。 */
export interface SnapshotItem {
    index: number;
    /** 元素角色（link、button 等），决定点击语义。 */
    role: string;
    name: string;
    /** 链接的 headline 形式（同源相对路径，或 host+path）。 */
    href?: string;
}
/** 解析后的页面快照。 */
export interface Snapshot {
    url: string;
    title: string;
    main: string;
    items: SnapshotItem[];
}
/** 下载入口的格式。CAJ 需要专用阅读器，不能当作 PDF 呈现。 */
export type DownloadFormat = 'pdf' | 'caj' | 'other';
/** 一个候选下载入口，带格式与排序分。 */
export interface DownloadCandidate {
    url: string;
    format: DownloadFormat;
    score: number;
}
/** 一次中文下载入口解析的结果。 */
export interface ChineseDownloadResult {
    provider: ChineseProvider;
    detailUrl: string;
    title?: string;
    /** 站点自身的下载入口；未解析到时缺省。 */
    downloadUrl?: string;
    /** 入口格式；CAJ 只表示站点提供 CAJ，不代表有 PDF。 */
    format?: DownloadFormat;
    /** 是否已在受控浏览器标签页打开该入口。 */
    opened: boolean;
    status: 'opened' | 'link-resolved' | 'caj-only' | 'no-download-link' | 'captcha';
    message: string;
    /** 其余候选入口，便于人工比对。 */
    candidates?: string[];
}
/** 把 dsh-browser 的快照文本切成页面身份、主文和交互元素。 */
export declare function parseSnapshot(text: string): Snapshot;
/** 把快照里的 headline 补成绝对地址。 */
export declare function resolveHref(href: string, pageUrl: string): string | undefined;
/** 万方或维普的详情页 URL。 */
export declare function isDetailUrl(provider: ChineseBrowserProvider, url: string): boolean;
/** 三个站点的详情页 URL 归属；CNKI 同时接受 kcms2 摘要页和 detail.aspx 页。 */
export declare function chineseSourceFromUrl(url: string): ChineseProvider | undefined;
/** 浏览器工作流能处理的站点（不含 CNKI）。 */
export declare function providerFromUrl(url: string): ChineseBrowserProvider | undefined;
/** 按中英文常见分隔符切分列表字段。 */
export declare function splitList(value: string | undefined): string[];
/**
 * 拆分作者文本。作者容器只能整块读取（dsh-browser 不支持执行页面脚本），
 * 因此先按分隔符拆，只有一个结果时再按空白拆；拉丁姓名可能被多拆，需要人工核对。
 */
export declare function parseAuthors(value: string | undefined): string[];
/**
 * 解析“标签：值”型文本块。标签与值可能在同一行，也可能标签独占一行、
 * 值在下一行；只保留本页真实出现过的标签。
 */
export declare function parseLabelRows(text: string, labels: readonly string[]): Record<string, string>;
/** 取文本中的第一个 ISO 日期。 */
export declare function firstDate(value: string | undefined): string | undefined;
/** 取文本中的第一个四位年份。 */
export declare function yearFromText(value: string | undefined): number | undefined;
/** 规范 DOI：去掉前缀、链接和尾部标点，只接受符合 DOI 语法的值。 */
export declare function cleanDoi(value: string | undefined): string | undefined;
/** 去掉摘要里的标签和折叠提示。 */
export declare function cleanAbstract(value: string | undefined): string | undefined;
export declare function hostAllowed(provider: ChineseProvider, url: string): boolean;
/**
 * 判断一个入口的格式。阅读页返回 `reader`（不是下载），其余返回
 * `pdf`/`caj`/`other`；站点只给 CAJ 时调用方必须如实告知，不能冒充 PDF。
 */
export declare function formatOfDownload(name: string, url: string): DownloadFormat | 'reader' | undefined;
/**
 * 给一个链接打分：PDF 入口优先（阅读器通用），CAJ 入口保留但排在后面，
 * 阅读页直接排除；客户端、帮助等导航链接扣分，避免误选。
 */
export declare function scoreDownloadLink(name: string, url: string): number;
/**
 * 从快照里挑出站点自身的下载入口：域名必须属于该站点、不能是详情页本身，
 * 并按格式与名称路径打分排序（PDF 在前，CAJ 在后）。只解析入口，不发起下载。
 */
export declare function parseDownloadCandidates(provider: ChineseProvider, snapshot: Snapshot, detailUrl: string): DownloadCandidate[];
/** 在同一 agent 上以内嵌子调用方式调用 dsh-browser 工具。 */
export declare class ChineseBrowserWorkflow {
    private readonly ctx;
    private sequence;
    constructor(ctx: Context);
    private call;
    /** 打开详情页并读一次快照；验证码交给调用方决定是报错还是回传状态。 */
    private openPage;
    private readText;
    /** 万方摘要默认折叠；点“查看全部”后重读，失败时沿用截断文本。 */
    private tryExpandSummary;
    search(provider: ChineseBrowserProvider, query: string, limit: number, exec: ToolRunContext): Promise<PaperMeta[]>;
    /**
     * 读取详情元数据，并顺带解析站点下载入口（`siteDownloadUrl`）。
     * 摘要需要展开时会刷新快照，保证下载入口的索引来自最新页面。
     */
    detail(provider: ChineseBrowserProvider, url: string, exec: ToolRunContext): Promise<PaperMeta>;
    /** 解析站点下载入口；整页快照没有命中时，再按站点区域重读。 */
    private resolveDownloadUrls;
    /**
     * 解析中文文献的站内下载入口，并按 `open` 决定是否在用户的受控浏览器标签页里
     * 打开它。文件由用户浏览器的下载目录保存，插件不读取也不代为抓取；只给 CAJ
     * 时用 `caj-only` 如实说明，不冒充 PDF。
     */
    download(provider: ChineseProvider, detailUrl: string, exec: ToolRunContext, options: {
        open: boolean;
    }): Promise<ChineseDownloadResult>;
    private wanfangDetail;
    private cqvipDetail;
}
