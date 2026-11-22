/**
 * 使用现有 dsh-browser 工具完成万方、维普的详情抽取，以及 CNKI、万方、维普的
 * 站内下载链接解析。工具只读取站点自身提供的下载入口并把它交给用户的浏览器，
 * 不在插件进程里抓取受限全文，也不绕过登录、订阅或验证码。
 * @module dsh-scholar-search/chinese/browser-workflow
 */
const SEARCH_URLS = {
    wanfang: 'https://s.wanfangdata.com.cn/paper?q=',
    cqvip: 'https://www.cqvip.com/search?k=',
};
const CAPTCHA_SIGNALS = ['验证码', '安全验证', '请完成验证', 'robot', 'verify', 'human', '滑动'];
/** 详情页中承载下载入口的区域，按优先级依次尝试。 */
export const DOWNLOAD_REGIONS = {
    cnki: ['.download-btns'],
    wanfang: ['div.detailIcon', 'div.buttons'],
    cqvip: ['div.mainContainerDataList-item'],
};
/** 允许出现在下载候选里的站点域名。 */
const DOWNLOAD_HOSTS = {
    cnki: ['cnki.net'],
    wanfang: ['wanfangdata.com.cn'],
    cqvip: ['cqvip.com'],
};
/** 万方详情页按“标签：值”组织的字段。 */
const WANFANG_LABELS = ['文献发表日期', '在线出版日期', '机构', '分类号', '资助基金', '页数', '关键词', '摘要', 'DOI', 'doi'];
/**
 * dsh-browser 快照的交互元素行：`  [3] link "PDF下载" [disabled] → host/path`。
 * 名字按贪婪匹配取到最后一个引号，状态标记可有可无。
 */
const ITEM_LINE = /^\s*\[(\d+)\]\s+([a-z]+)\s+"(.*)"(?:\s+\[[^\]]*\])?(?:\s+→\s+(.+))?$/;
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/i;
function textBlocks(result) {
    return result.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('\n');
}
/** 把 dsh-browser 的快照文本切成页面身份、主文和交互元素。 */
export function parseSnapshot(text) {
    const lines = text.split(/\r?\n/);
    const url = lines.find(line => line.startsWith('URL: '))?.slice(5).trim() ?? '';
    const title = lines.find(line => line.startsWith('Title: '))?.slice(7).trim() ?? '';
    const mainStart = lines.indexOf('Main content:');
    const itemsStart = lines.indexOf('Interactive elements:');
    const formsStart = lines.indexOf('Form fields:');
    const mainEnd = itemsStart >= 0 ? itemsStart : formsStart >= 0 ? formsStart : lines.length;
    const main = mainStart >= 0 ? lines.slice(mainStart + 1, mainEnd).join('\n').trim() : '';
    const itemEnd = formsStart >= 0 ? formsStart : lines.length;
    const items = [];
    if (itemsStart >= 0) {
        for (const line of lines.slice(itemsStart + 1, itemEnd)) {
            const match = line.match(ITEM_LINE);
            if (match === null)
                continue;
            const item = { index: Number(match[1]), role: match[2] ?? 'link', name: match[3] ?? '' };
            const href = match[4]?.trim();
            if (href !== undefined && href !== '')
                item.href = href;
            items.push(item);
        }
    }
    return { url, title, main, items };
}
/** 把快照里的 headline 补成绝对地址。 */
export function resolveHref(href, pageUrl) {
    try {
        if (/^https?:\/\//i.test(href))
            return href;
        if (/^[^/]+\.[^/]+\//.test(href))
            return `https://${href}`;
        return new URL(href, pageUrl).toString();
    }
    catch {
        return undefined;
    }
}
/** 万方或维普的详情页 URL。 */
export function isDetailUrl(provider, url) {
    const source = chineseSourceFromUrl(url);
    return source !== undefined && source !== 'cnki' && source === provider;
}
/** 三个站点的详情页 URL 归属；CNKI 同时接受 kcms2 摘要页和 detail.aspx 页。 */
export function chineseSourceFromUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port)
            return undefined;
        if (parsed.hostname === 'kns.cnki.net' && (/^\/kcms2\/article\/abstract/.test(parsed.pathname) || parsed.pathname.startsWith('/kcms/detail/detail.aspx')))
            return 'cnki';
        if (parsed.hostname === 'd.wanfangdata.com.cn' && parsed.pathname.includes('/periodical/'))
            return 'wanfang';
        if (hostAllowed('cqvip', url) && parsed.pathname.includes('/doc/'))
            return 'cqvip';
        return undefined;
    }
    catch {
        return undefined;
    }
}
/** 浏览器工作流能处理的站点（不含 CNKI）。 */
export function providerFromUrl(url) {
    const source = chineseSourceFromUrl(url);
    return source === undefined || source === 'cnki' ? undefined : source;
}
function hasCaptcha(snapshot) {
    const haystack = `${snapshot.title}\n${snapshot.main}`.toLowerCase();
    return CAPTCHA_SIGNALS.some(signal => haystack.includes(signal.toLowerCase()));
}
/** 按中英文常见分隔符切分列表字段。 */
export function splitList(value) {
    if (value === undefined)
        return [];
    return value
        .split(/[;；、,，\n]+/)
        .map(item => item.replace(/\u00a0/g, ' ').trim())
        .filter(item => item !== '');
}
/**
 * 拆分作者文本。作者容器只能整块读取（dsh-browser 不支持执行页面脚本），
 * 因此先按分隔符拆，只有一个结果时再按空白拆；拉丁姓名可能被多拆，需要人工核对。
 */
export function parseAuthors(value) {
    if (value === undefined)
        return [];
    const normalized = value.replace(/\u00a0/g, ' ').trim();
    if (normalized === '')
        return [];
    const bySeparator = normalized.split(/[;；、,，\n]+/).map(item => item.trim()).filter(item => item !== '');
    if (bySeparator.length > 1)
        return bySeparator;
    const bySpace = normalized.split(/\s+/).filter(item => item !== '');
    return bySpace.length > 1 ? bySpace : bySeparator;
}
/**
 * 解析“标签：值”型文本块。标签与值可能在同一行，也可能标签独占一行、
 * 值在下一行；只保留本页真实出现过的标签。
 */
export function parseLabelRows(text, labels) {
    const rows = {};
    const lines = text
        .split(/\r?\n/)
        .map(line => line.replace(/\u00a0/g, ' ').trim())
        .filter(line => line !== '');
    for (const [index, line] of lines.entries()) {
        for (const label of labels) {
            if (rows[label] !== undefined)
                continue;
            const stripped = line.replace(new RegExp(`^${label}\\s*[:：]?\\s*`), '');
            if (stripped === line)
                continue;
            const value = stripped.trim();
            rows[label] = value !== '' ? value : (lines[index + 1] ?? '').trim();
        }
    }
    return rows;
}
/** 取文本中的第一个 ISO 日期。 */
export function firstDate(value) {
    if (value === undefined)
        return undefined;
    return /\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
}
/** 取文本中的第一个四位年份。 */
export function yearFromText(value) {
    if (value === undefined)
        return undefined;
    const match = /\b(19|20)\d{2}\b/.exec(value);
    return match === null ? undefined : Number(match[0]);
}
/** 规范 DOI：去掉前缀、链接和尾部标点，只接受符合 DOI 语法的值。 */
export function cleanDoi(value) {
    if (value === undefined)
        return undefined;
    const cleaned = value
        .replace(/^doi\s*[:：]\s*/i, '')
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
        .replace(/[。.;；,，]+$/g, '')
        .trim();
    return DOI_PATTERN.test(cleaned) ? cleaned : undefined;
}
/** 去掉摘要里的标签和折叠提示。 */
export function cleanAbstract(value) {
    if (value === undefined)
        return undefined;
    const cleaned = value
        .replace(/^摘要\s*[:：]?\s*/, '')
        .replace(/\s*(收起|查看全部|展开全部)\s*$/g, '')
        .trim();
    return cleaned === '' ? undefined : cleaned;
}
function isHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    }
    catch {
        return false;
    }
}
function normalizeDetailUrl(value) {
    try {
        const parsed = new URL(value);
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    }
    catch {
        return value.replace(/#.*$/, '').replace(/\/$/, '');
    }
}
export function hostAllowed(provider, url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return DOWNLOAD_HOSTS[provider].some(base => host === base || host.endsWith(`.${base}`));
    }
    catch {
        return false;
    }
}
/** 知网详情页的阅读入口：HTML 阅读、原版阅读都不是文件下载。 */
const READER_PATTERN = /html\s*阅读|原版阅读|在线阅读|阅读全文|htmlread/i;
const CAJ_PATTERN = /caj|btn-dlcaj/i;
const PDF_PATTERN = /pdf|btn-dlpdf|\.pdf/i;
/**
 * 判断一个入口的格式。阅读页返回 `reader`（不是下载），其余返回
 * `pdf`/`caj`/`other`；站点只给 CAJ 时调用方必须如实告知，不能冒充 PDF。
 */
export function formatOfDownload(name, url) {
    const haystack = `${name}\n${url}`;
    if (READER_PATTERN.test(haystack))
        return 'reader';
    const caj = CAJ_PATTERN.test(haystack);
    const pdf = PDF_PATTERN.test(haystack);
    if (pdf && !caj)
        return 'pdf';
    if (caj && !pdf)
        return 'caj';
    if (pdf && caj)
        return /caj/i.test(name) ? 'caj' : 'pdf';
    if (/下载/.test(name))
        return 'other';
    return undefined;
}
/**
 * 给一个链接打分：PDF 入口优先（阅读器通用），CAJ 入口保留但排在后面，
 * 阅读页直接排除；客户端、帮助等导航链接扣分，避免误选。
 */
export function scoreDownloadLink(name, url) {
    const format = formatOfDownload(name, url);
    if (format === 'reader' || format === undefined)
        return 0;
    let score = 0;
    if (format === 'pdf')
        score += 8;
    if (format === 'caj')
        score += 2;
    if (/下载|全文/.test(name))
        score += 4;
    if (/download|getpdf|pdfdown|\.pdf/i.test(url))
        score += 3;
    if (/客户端|app|软件|帮助|指南|登录|注册/i.test(name))
        score -= 5;
    return score;
}
/**
 * 从快照里挑出站点自身的下载入口：域名必须属于该站点、不能是详情页本身，
 * 并按格式与名称路径打分排序（PDF 在前，CAJ 在后）。只解析入口，不发起下载。
 */
export function parseDownloadCandidates(provider, snapshot, detailUrl) {
    const detail = normalizeDetailUrl(detailUrl);
    const pageUrl = snapshot.url !== '' ? snapshot.url : detailUrl;
    const scored = [];
    for (const item of snapshot.items) {
        if (item.href === undefined || item.href.trim() === '')
            continue;
        const url = resolveHref(item.href, pageUrl);
        if (url === undefined || !isHttpUrl(url))
            continue;
        if (!hostAllowed(provider, url))
            continue;
        if (normalizeDetailUrl(url) === detail)
            continue;
        const format = formatOfDownload(item.name, url);
        if (format === undefined || format === 'reader')
            continue;
        const score = scoreDownloadLink(item.name, url);
        if (score <= 0)
            continue;
        scored.push({ url, format, score });
    }
    scored.sort((left, right) => right.score - left.score);
    return [...new Map(scored.map(entry => [entry.url, entry])).values()];
}
function noLinkMessage(provider) {
    if (provider === 'cnki') {
        return '该页面没有可用的下载入口：可能未登录、机构未订阅，或下载区没有渲染。请在受控浏览器里确认登录与订阅状态后重试。';
    }
    if (provider === 'wanfang') {
        return '万方详情页没有找到下载入口：可能需要机构订阅、按钮尚未渲染，或页面结构与已知选择器不一致。';
    }
    return '维普详情页没有稳定的全文下载入口（技能规格本身也不提供 pdf_url），请在该页面手动确认。';
}
function cajOnlyMessage() {
    return '该页面只提供 CAJ 入口：CAJ 需要 CAJViewer 等专用阅读器，不是 PDF，也不能改扩展名冒充 PDF。确认后传 open=true 可用浏览器打开；需要 PDF 时请在该页面确认是否另有 PDF 入口。';
}
/** 在同一 agent 上以内嵌子调用方式调用 dsh-browser 工具。 */
export class ChineseBrowserWorkflow {
    ctx;
    sequence = 0;
    constructor(ctx) {
        this.ctx = ctx;
    }
    async call(exec, name, args) {
        if (this.ctx.tools.get(name, exec.agent) === undefined) {
            throw new Error(`dsh-browser tool unavailable: ${name}`);
        }
        const input = {
            callId: `${String(exec.callId)}:chinese:${++this.sequence}`,
            rootCallId: exec.rootCallId,
            parent: exec.token,
            name,
            arguments: args,
            ...(exec.agent === undefined ? {} : { agent: exec.agent }),
            signal: exec.signal,
        };
        const result = await this.ctx.tools.execute(input);
        if (result.isError)
            throw new Error(textBlocks(result) || `${name} failed`);
        return textBlocks(result);
    }
    /** 打开详情页并读一次快照；验证码交给调用方决定是报错还是回传状态。 */
    async openPage(url, exec) {
        await this.call(exec, 'browser_open_tab', { url });
        await this.call(exec, 'browser_wait', { ms: 2_000 });
        const snapshot = parseSnapshot(await this.call(exec, 'browser_snapshot', {}));
        return { snapshot, captcha: hasCaptcha(snapshot) };
    }
    async readText(exec, selector) {
        try {
            const value = (await this.call(exec, 'browser_get_text', { selector })).trim();
            if (value === '')
                return undefined;
            if (/^No element matched selector: /.test(value))
                return undefined;
            return value;
        }
        catch {
            return undefined;
        }
    }
    /** 万方摘要默认折叠；点“查看全部”后重读，失败时沿用截断文本。 */
    async tryExpandSummary(snapshot, exec) {
        const target = snapshot.items.find(item => (item.role === 'button' || item.role === 'link') && /查看全部|展开全部/.test(item.name));
        if (target === undefined)
            return false;
        try {
            await this.call(exec, 'browser_click', { index: target.index });
            await this.call(exec, 'browser_wait', { ms: 800 });
            return true;
        }
        catch {
            return false;
        }
    }
    async search(provider, query, limit, exec) {
        const opened = await this.call(exec, 'browser_open_tab', { url: `${SEARCH_URLS[provider]}${encodeURIComponent(query)}` });
        await this.call(exec, 'browser_wait', { ms: 2_000 });
        const snapshot = parseSnapshot(await this.call(exec, 'browser_snapshot', {}));
        if (hasCaptcha(snapshot))
            throw new Error(`${provider} requires manual verification in the controlled browser tab`);
        const papers = [];
        for (const item of snapshot.items) {
            if (papers.length >= limit || item.href === undefined)
                continue;
            if (item.role !== 'link')
                continue;
            const url = resolveHref(item.href, snapshot.url);
            if (url === undefined || !isDetailUrl(provider, url) || item.name.trim() === '')
                continue;
            papers.push({ title: item.name.trim(), source: provider, sourceId: url, landingPageUrl: url });
        }
        if (papers.length === 0 && opened.toLowerCase().includes('failed'))
            throw new Error(`${provider} browser search returned no usable page`);
        return papers;
    }
    /**
     * 读取详情元数据，并顺带解析站点下载入口（`siteDownloadUrl`）。
     * 摘要需要展开时会刷新快照，保证下载入口的索引来自最新页面。
     */
    async detail(provider, url, exec) {
        if (!isDetailUrl(provider, url))
            throw new Error(`unsupported ${provider} detail URL`);
        const opened = await this.openPage(url, exec);
        if (opened.captcha)
            throw new Error(`${provider} requires manual verification in the controlled browser tab`);
        let snapshot = opened.snapshot;
        if (await this.tryExpandSummary(snapshot, exec)) {
            snapshot = parseSnapshot(await this.call(exec, 'browser_snapshot', {}));
        }
        const paper = provider === 'wanfang'
            ? await this.wanfangDetail(url, snapshot, exec)
            : await this.cqvipDetail(url, snapshot, exec);
        const downloadUrls = await this.resolveDownloadUrls(provider, snapshot, url, exec);
        const best = downloadUrls.find(candidate => candidate.format === 'pdf') ?? downloadUrls[0];
        if (best !== undefined)
            paper.siteDownloadUrl = best.url;
        return paper;
    }
    /** 解析站点下载入口；整页快照没有命中时，再按站点区域重读。 */
    async resolveDownloadUrls(provider, snapshot, detailUrl, exec) {
        const found = parseDownloadCandidates(provider, snapshot, detailUrl);
        if (found.length > 0)
            return found;
        const collected = [];
        for (const selector of DOWNLOAD_REGIONS[provider]) {
            try {
                const region = parseSnapshot(await this.call(exec, 'browser_snapshot', { region: selector }));
                for (const candidate of parseDownloadCandidates(provider, region, detailUrl)) {
                    if (!collected.some(entry => entry.url === candidate.url))
                        collected.push(candidate);
                }
            }
            catch {
                // 区域不存在时继续尝试下一个选择器。
            }
            if (collected.length > 0)
                break;
        }
        return collected;
    }
    /**
     * 解析中文文献的站内下载入口，并按 `open` 决定是否在用户的受控浏览器标签页里
     * 打开它。文件由用户浏览器的下载目录保存，插件不读取也不代为抓取；只给 CAJ
     * 时用 `caj-only` 如实说明，不冒充 PDF。
     */
    async download(provider, detailUrl, exec, options) {
        const opened = await this.openPage(detailUrl, exec);
        const result = {
            provider,
            detailUrl,
            opened: false,
            status: 'no-download-link',
            message: noLinkMessage(provider),
        };
        if (opened.snapshot.title !== '')
            result.title = opened.snapshot.title;
        if (opened.captcha) {
            return { ...result, status: 'captcha', message: '当前标签页出现验证码，请在受控浏览器里完成验证后重试。' };
        }
        const candidates = await this.resolveDownloadUrls(provider, opened.snapshot, detailUrl, exec);
        const best = candidates.find(candidate => candidate.format === 'pdf') ?? candidates[0];
        if (best === undefined)
            return result;
        const cajOnly = best.format === 'caj';
        const resolved = {
            ...result,
            downloadUrl: best.url,
            format: best.format,
            status: cajOnly ? 'caj-only' : 'link-resolved',
            message: cajOnly ? cajOnlyMessage() : '已解析站点下载入口，尚未打开；确认后再传 open=true。',
        };
        const others = candidates.filter(candidate => candidate.url !== best.url).map(candidate => candidate.url);
        if (others.length > 0)
            resolved.candidates = others;
        if (!options.open)
            return resolved;
        try {
            await this.call(exec, 'browser_open_tab', { url: best.url, active: true });
            return {
                ...resolved,
                opened: true,
                status: cajOnly ? 'caj-only' : 'opened',
                message: cajOnly
                    ? '已在受控浏览器打开 CAJ 入口；CAJ 需要专用阅读器，不是 PDF。打开入口不等于下载完成，请在浏览器下载列表中核对文件名与保存位置。'
                    : `已在受控浏览器打开 ${provider} 的下载入口。打开入口不等于下载完成：请在浏览器下载列表核对文件名与保存位置，不覆盖同名文件。`,
            };
        }
        catch (error) {
            return {
                ...resolved,
                message: `${resolved.message} 打开标签页失败：${error instanceof Error ? error.message : String(error)}；可以直接使用 downloadUrl。`,
            };
        }
    }
    async wanfangDetail(url, snapshot, exec) {
        const title = await this.readText(exec, 'div.detailWBG div.detailTitleCN div span');
        if (title === undefined)
            throw new Error('wanfang detail page has no title');
        const paper = { title, source: 'wanfang', sourceId: url, landingPageUrl: url };
        const authors = parseAuthors(await this.readText(exec, 'div.author.detailTitle div.itemUrl'));
        if (authors.length > 0)
            paper.authors = authors;
        const rows = parseLabelRows(await this.readText(exec, 'div.detailList') ?? '', WANFANG_LABELS);
        const abstract = cleanAbstract(rows['摘要']);
        if (abstract !== undefined)
            paper.abstract = abstract;
        const keywords = splitList(rows['关键词']);
        if (keywords.length > 0)
            paper.keywords = keywords;
        const publishDate = firstDate(rows['文献发表日期']);
        if (publishDate !== undefined)
            paper.publishDate = publishDate;
        const onlinePublishDate = firstDate(rows['在线出版日期']);
        if (onlinePublishDate !== undefined)
            paper.onlinePublishDate = onlinePublishDate;
        const organizations = splitList(rows['机构']);
        if (organizations.length > 0)
            paper.organizations = organizations;
        const funds = splitList(rows['资助基金']);
        if (funds.length > 0)
            paper.funds = funds;
        const classifications = splitList(rows['分类号']);
        if (classifications.length > 0)
            paper.classifications = classifications;
        const pageRange = rows['页数']?.match(/\d+\s*[-–—]\s*\d+/)?.[0].replace(/\s+/g, '');
        if (pageRange !== undefined)
            paper.pages = pageRange;
        const doi = cleanDoi(rows['DOI'] ?? rows['doi']);
        if (doi !== undefined)
            paper.doi = doi;
        const year = yearFromText(publishDate ?? onlinePublishDate) ?? yearFromText(snapshot.main);
        if (year !== undefined)
            paper.year = year;
        return paper;
    }
    async cqvipDetail(url, snapshot, exec) {
        const title = await this.readText(exec, 'div.top-detail div.detail-left-title span.font-size24');
        if (title === undefined)
            throw new Error('cqvip detail page has no title');
        const paper = { title, source: 'cqvip', sourceId: url, landingPageUrl: url };
        const authors = parseAuthors(await this.readText(exec, 'div.mainContainerDataList-item div.author-ellipsis a.f-c-root'));
        if (authors.length > 0)
            paper.authors = authors;
        const abstract = cleanAbstract(await this.readText(exec, 'div.mainContainerDataList-item span.content-text'));
        if (abstract !== undefined)
            paper.abstract = abstract;
        const block = await this.readText(exec, 'div.mainContainerDataList-item') ?? '';
        const doi = cleanDoi(/doi\s*[:：]\s*([^\s;；,，]+)/i.exec(block)?.[1]);
        if (doi !== undefined)
            paper.doi = doi;
        const keywords = splitList(await this.readText(exec, 'div.mainContainerDataList-item div.info-line span.select_hover'));
        if (keywords.length > 0)
            paper.keywords = keywords;
        const year = yearFromText(snapshot.main);
        if (year !== undefined)
            paper.year = year;
        return paper;
    }
}
