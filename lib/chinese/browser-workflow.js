/**
 * 使用现有 dsh-browser 工具完成万方和维普检索。
 * @module dsh-scholar-search/chinese/browser-workflow
 */
const SEARCH_URLS = {
    wanfang: 'https://s.wanfangdata.com.cn/paper?q=',
    cqvip: 'https://www.cqvip.com/search?k=',
};
const CAPTCHA_SIGNALS = ['验证码', '安全验证', '请完成验证', 'robot', 'verify', 'human', '滑动'];
function textBlocks(result) {
    return result.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('\n');
}
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
            const match = line.match(/^\s*\[(\d+)\]\s+link\s+"(.*)"(?:\s+→\s+(.+))?$/);
            if (match !== null) {
                const item = { index: Number(match[1]), name: match[2] ?? '' };
                if (match[3] !== undefined && match[3].trim() !== '')
                    item.href = match[3].trim();
                items.push(item);
            }
        }
    }
    return { url, title, main, items };
}
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
export function isDetailUrl(provider, url) {
    try {
        const parsed = new URL(url);
        if (provider === 'wanfang')
            return parsed.hostname === 'd.wanfangdata.com.cn' && parsed.pathname.includes('/periodical/');
        return parsed.protocol === 'https:' && parsed.hostname.endsWith('cqvip.com') && parsed.pathname.includes('/doc/');
    }
    catch {
        return false;
    }
}
function hasCaptcha(snapshot) {
    const haystack = `${snapshot.title}\n${snapshot.main}`.toLowerCase();
    return CAPTCHA_SIGNALS.some(signal => haystack.includes(signal.toLowerCase()));
}
function splitValues(value) {
    return value === undefined ? [] : value.split(/[;；、,，\n]/).map(item => item.trim()).filter(Boolean);
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
            const url = resolveHref(item.href, snapshot.url);
            if (url === undefined || !isDetailUrl(provider, url) || item.name.trim() === '')
                continue;
            papers.push({ title: item.name.trim(), source: provider, sourceId: url, landingPageUrl: url });
        }
        if (papers.length === 0 && opened.toLowerCase().includes('failed'))
            throw new Error(`${provider} browser search returned no usable page`);
        return papers;
    }
    async detail(provider, url, exec) {
        if (!isDetailUrl(provider, url))
            throw new Error(`unsupported ${provider} detail URL`);
        await this.call(exec, 'browser_open_tab', { url });
        await this.call(exec, 'browser_wait', { ms: 2_000 });
        const snapshot = parseSnapshot(await this.call(exec, 'browser_snapshot', {}));
        if (hasCaptcha(snapshot))
            throw new Error(`${provider} requires manual verification in the controlled browser tab`);
        const read = async (selector) => {
            try {
                const value = await this.call(exec, 'browser_get_text', { selector });
                return value.trim() || undefined;
            }
            catch {
                return undefined;
            }
        };
        const title = provider === 'wanfang'
            ? await read('div.detailWBG div.detailTitleCN div span')
            : await read('div.top-detail div.detail-left-title span.font-size24');
        if (title === undefined)
            throw new Error(`${provider} detail page has no title`);
        const authors = provider === 'wanfang'
            ? splitValues(await read('div.author.detailTitle div.itemUrl a.test-detail-author'))
            : splitValues(await read('div.mainContainerDataList-item div.author-ellipsis a.f-c-root'));
        const abstract = provider === 'wanfang'
            ? await read('div.detailList div.summary.list span.text-overflow')
            : await read('div.mainContainerDataList-item span.content-text');
        const keywords = provider === 'wanfang'
            ? splitValues(await read('div.detailList div.keyword.list div.itemKeyword'))
            : splitValues(await read('div.mainContainerDataList-item div.info-line span.select_hover'));
        const paper = { title, source: provider, sourceId: url, landingPageUrl: url };
        if (authors.length > 0)
            paper.authors = authors;
        if (abstract !== undefined)
            paper.abstract = abstract;
        if (keywords.length > 0)
            paper.keywords = keywords;
        const year = snapshot.main.match(/\b(19|20)\d{2}\b/)?.[0];
        if (year !== undefined)
            paper.year = Number(year);
        return paper;
    }
}
export function providerFromUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.hostname === 'd.wanfangdata.com.cn' && parsed.pathname.includes('/periodical/'))
            return 'wanfang';
        if (parsed.protocol === 'https:' && parsed.hostname.endsWith('cqvip.com') && parsed.pathname.includes('/doc/'))
            return 'cqvip';
        return undefined;
    }
    catch {
        return undefined;
    }
}
