/**
 * CNKI、万方和维普的中文论文检索、详情读取与站内下载入口工具。
 * @module dsh-scholar-search/tools/chinese-search
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ChineseBrowserWorkflow, chineseSourceFromUrl, providerFromUrl, } from '../chinese/browser-workflow.js';
import { readCnkiPaper } from '../chinese/cnki-mcp.js';
const PROVIDERS = ['cnki', 'wanfang', 'cqvip'];
const PAPER_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        title: { type: 'string', required: true },
        authors: { type: 'array', items: { type: 'string' } },
        year: { type: 'integer' },
        volume: { type: 'string' },
        issue: { type: 'string' },
        pages: { type: 'string' },
        venue: { type: 'string' },
        abstract: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        doi: { type: 'string' },
        publishDate: { type: 'string' },
        onlinePublishDate: { type: 'string' },
        organizations: { type: 'array', items: { type: 'string' } },
        funds: { type: 'array', items: { type: 'string' } },
        classifications: { type: 'array', items: { type: 'string' } },
        siteDownloadUrl: { type: 'string' },
        landingPageUrl: { type: 'string' },
        source: { type: 'string', required: true },
        sourceId: { type: 'string', required: true },
    },
};
const SEARCH_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        query: { type: 'string', required: true },
        total: { type: 'integer', required: true },
        papers: { type: 'array', required: true, items: PAPER_SCHEMA },
        searchedSources: { type: 'array', required: true, items: { type: 'string' } },
        failedSources: { type: 'array', items: { type: 'string' } },
        failureMessages: { type: 'array', items: { type: 'string' } },
    },
};
const DOWNLOAD_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        provider: { type: 'string', required: true },
        detailUrl: { type: 'string', required: true },
        title: { type: 'string' },
        downloadUrl: { type: 'string' },
        format: { type: 'string' },
        opened: { type: 'boolean', required: true },
        status: { type: 'string', required: true },
        message: { type: 'string', required: true },
        candidates: { type: 'array', items: { type: 'string' } },
    },
};
function present(title) {
    return { card: 'generic', title, kind: 'search', rawInput: title };
}
function renderSearch(value) {
    const lines = [`中文论文检索“${value.query}”：${value.total} 条结果，来源：${value.searchedSources.join('、')}`];
    for (const [index, paper] of value.papers.entries()) {
        lines.push(`${index + 1}. ${paper.title}${paper.year === undefined ? '' : `（${paper.year}）`}${paper.venue === undefined ? '' : ` — ${paper.venue}`}`);
        lines.push(`   来源：${paper.source}；详情：${paper.landingPageUrl ?? paper.sourceId}`);
        if (paper.authors !== undefined && paper.authors.length > 0)
            lines.push(`   作者：${paper.authors.join('、')}`);
        if (paper.keywords !== undefined && paper.keywords.length > 0)
            lines.push(`   关键词：${paper.keywords.join('、')}`);
        if (paper.abstract !== undefined)
            lines.push(`   摘要：${paper.abstract.slice(0, 400)}`);
    }
    if (value.failedSources.length > 0)
        lines.push(`失败来源：${value.failedSources.join('、')}`);
    if (value.failureMessages.length > 0)
        lines.push(`失败原因：${value.failureMessages.join('；')}`);
    return [{ type: 'text', text: lines.join('\n') }];
}
/** 把详情元数据渲染成逐字段文本，缺失字段直接省略。 */
function renderPaper(paper) {
    const lines = [paper.title];
    const meta = [];
    if (paper.authors !== undefined && paper.authors.length > 0)
        meta.push(`作者：${paper.authors.join('、')}`);
    if (paper.venue !== undefined)
        meta.push(`来源：${paper.venue}`);
    if (paper.year !== undefined)
        meta.push(`年：${paper.year}`);
    if (paper.volume !== undefined)
        meta.push(`卷：${paper.volume}`);
    if (paper.issue !== undefined)
        meta.push(`期：${paper.issue}`);
    if (paper.pages !== undefined)
        meta.push(`页码：${paper.pages}`);
    if (paper.doi !== undefined)
        meta.push(`DOI：${paper.doi}`);
    if (paper.publishDate !== undefined)
        meta.push(`发表日期：${paper.publishDate}`);
    if (paper.onlinePublishDate !== undefined)
        meta.push(`在线出版日期：${paper.onlinePublishDate}`);
    if (meta.length > 0)
        lines.push(meta.join('；'));
    if (paper.organizations !== undefined && paper.organizations.length > 0)
        lines.push(`机构：${paper.organizations.join('；')}`);
    if (paper.funds !== undefined && paper.funds.length > 0)
        lines.push(`资助基金：${paper.funds.join('；')}`);
    if (paper.classifications !== undefined && paper.classifications.length > 0)
        lines.push(`分类号：${paper.classifications.join('；')}`);
    if (paper.keywords !== undefined && paper.keywords.length > 0)
        lines.push(`关键词：${paper.keywords.join('、')}`);
    if (paper.abstract !== undefined)
        lines.push(`摘要：${paper.abstract}`);
    lines.push(`详情页：${paper.landingPageUrl ?? paper.sourceId}`);
    lines.push(paper.siteDownloadUrl === undefined
        ? '站内下载入口：未在详情页找到；需要时用 chinese_scholar_download 单独解析。'
        : `站内下载入口：${paper.siteDownloadUrl}`);
    return [{ type: 'text', text: lines.join('\n') }];
}
function renderDownload(value) {
    const lines = [`中文全文下载入口（${value.provider}）：${value.status}`];
    if (value.title !== undefined)
        lines.push(`页面标题：${value.title}`);
    lines.push(`详情页：${value.detailUrl}`);
    if (value.downloadUrl !== undefined)
        lines.push(`下载入口（${value.format ?? '格式未识别'}）：${value.downloadUrl}`);
    if (value.candidates !== undefined && value.candidates.length > 0)
        lines.push(`其它候选：${value.candidates.join('；')}`);
    lines.push(value.message);
    if (value.format === 'caj')
        lines.push('CAJ 不是 PDF：需要 CAJViewer 等专用阅读器，不能改扩展名冒充 PDF。');
    if (value.opened)
        lines.push('打开入口不等于下载完成；请核对浏览器下载列表中的文件名与保存位置，再用 scholar_read 按本地路径读取。');
    return [{ type: 'text', text: lines.join('\n') }];
}
function selectedProviders(value) {
    if (!Array.isArray(value) || value.length === 0)
        return [...PROVIDERS];
    return value.filter((item) => typeof item === 'string' && PROVIDERS.includes(item));
}
export { paperFromCnkiRecord } from '../chinese/cnki-mcp.js';
/** 从 url 或 paper 参数解析出要处理的中文详情页地址。 */
function resolveDetailUrl(args) {
    const direct = args.url?.trim();
    const fromPaper = args.paper?.landingPageUrl?.trim() ?? args.paper?.sourceId?.trim();
    if (direct !== undefined && direct !== '') {
        if (fromPaper !== undefined && fromPaper !== '')
            throw new Error('url 与 paper 只能提供一项');
        return direct;
    }
    if (fromPaper === undefined || fromPaper === '')
        throw new Error('需要提供 url 或 paper');
    return fromPaper;
}
/** 注册中文检索、详情和下载入口工具。 */
export function applyChineseSearchTools(ctx, runtime) {
    const workflow = new ChineseBrowserWorkflow(ctx);
    ctx.tools.register(defineTool({
        name: 'chinese_scholar_search',
        description: 'Search Chinese papers on CNKI (cnki-mcp), Wanfang, and CQVIP. CNKI uses a managed cnki-mcp browser; Wanfang/CQVIP use the connected dsh-browser tab. Results are grouped by source and failures are reported separately.',
        parameters: {
            query: { type: 'string', required: true, description: 'Chinese paper search keywords.' },
            sources: { type: 'array', items: { type: 'string', enum: [...PROVIDERS] }, description: 'Subset of cnki, wanfang, cqvip; default all.' },
            limit: { type: 'integer', description: 'Maximum results per source (default 10, max 20).' },
        },
        output: { schema: SEARCH_SCHEMA, render: (_args, value) => renderSearch(value) },
        timeoutMs: runtime.toolTimeoutMs,
        isConcurrencySafe: () => false,
        presentCall: args => present(`中文论文检索：${args.query}`),
        async execute(args, exec) {
            if (!runtime.chineseSearchEnabled())
                throw new Error('Chinese paper search is disabled');
            const query = args.query.trim();
            if (query.length === 0)
                throw new Error('query must be a non-empty string');
            const limit = Math.min(Math.max(1, Math.trunc(args.limit ?? 10)), 20);
            const providers = selectedProviders(args.sources);
            const papers = [];
            const failedSources = [];
            const failureMessages = [];
            for (const provider of providers) {
                try {
                    if (provider === 'cnki') {
                        if (runtime.cnkiMcp === undefined)
                            throw new Error('cnki-mcp is not configured');
                        papers.push(...await runtime.cnkiMcp.search({ query, limit }, exec.signal));
                    }
                    else {
                        papers.push(...await workflow.search(provider, query, limit, exec));
                    }
                }
                catch (error) {
                    if (!exec.signal.aborted) {
                        failedSources.push(provider);
                        failureMessages.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            if (exec.signal.aborted)
                exec.signal.throwIfAborted();
            return { query, total: papers.length, papers, searchedSources: providers, failedSources, failureMessages };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'chinese_scholar_detail',
        description: 'Read Chinese paper metadata from a CNKI, Wanfang, or CQVIP detail URL, including DOI, publication dates, organizations, funds, classifications, and the site’s own full-text download entry when the page exposes one. Wanfang/CQVIP use dsh-browser; CNKI is delegated to cnki-mcp.',
        parameters: { url: { type: 'string', required: true, description: 'Supported CNKI, Wanfang, or CQVIP detail URL.' } },
        output: { schema: PAPER_SCHEMA, render: (_args, value) => renderPaper(value) },
        timeoutMs: runtime.toolTimeoutMs,
        presentCall: args => present(`读取中文论文：${args.url}`),
        async execute(args, exec) {
            if (!runtime.chineseSearchEnabled())
                throw new Error('Chinese paper search is disabled');
            const url = args.url.trim();
            const provider = providerFromUrl(url);
            if (provider !== undefined)
                return workflow.detail(provider, url, exec);
            if (runtime.cnkiMcp === undefined)
                throw new Error('cnki-mcp is not configured');
            return readCnkiPaper(runtime.cnkiMcp, url, exec.signal);
        },
    }));
    ctx.tools.register(defineTool({
        name: 'chinese_scholar_download',
        description: 'Resolve a Chinese paper’s own full-text download entry from a CNKI, Wanfang, or CQVIP detail page. By default it only resolves and reports (title, entry URL, format); pass open=true to open the entry in the connected dsh-browser tab. PDF entries rank first; when only a CAJ entry exists it returns caj-only and never presents CAJ as PDF. It only hands the site’s own entry to the user’s browser: no login, subscription, captcha, or access-control bypass, no file fetched by the plugin, and an opened entry is not a completed download.',
        parameters: {
            url: { type: 'string', description: 'CNKI, Wanfang, or CQVIP detail URL.' },
            paper: { ...PAPER_SCHEMA, description: 'A paper object returned by chinese_scholar_search/detail; its landing page or source id is used.' },
            open: { type: 'boolean', description: 'Open the resolved entry in the connected browser tab. Defaults to false: resolve and report first, open only after the user confirms.' },
        },
        output: { schema: DOWNLOAD_SCHEMA, render: (_args, value) => renderDownload(value) },
        timeoutMs: runtime.toolTimeoutMs,
        isConcurrencySafe: () => false,
        presentCall: args => present(`中文全文下载入口：${args.url ?? args.paper?.title ?? ''}`),
        async execute(args, exec) {
            if (!runtime.chineseSearchEnabled())
                throw new Error('Chinese paper search is disabled');
            const detailUrl = resolveDetailUrl(args);
            const provider = chineseSourceFromUrl(detailUrl);
            if (provider === undefined)
                throw new Error('unsupported Chinese paper detail URL');
            return workflow.download(provider, detailUrl, exec, { open: args.open === true });
        },
    }));
}
