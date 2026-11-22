import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { looksLikePdf, prepareDownloadDir, safeFilename, saveFileExclusive } from '../download.js';
import { verifyPdfContent } from '../pdf.js';
import { chineseSourceFromUrl, DOWNLOAD_REGIONS, hostAllowed, scoreDownloadLink } from './browser-workflow.js';
const messages = {
    'login-required': '请在文献浏览器中完成登录或机构认证后重试。',
    captcha: '请在文献浏览器中完成页面验证后重试。',
    'access-denied': '站点拒绝访问，请在文献浏览器中确认账号的全文权限。',
    'no-download-link': '未读取到站点提供的下载按钮，请在文献浏览器中查看此详情页。',
    'browser-busy': '文献浏览器正在处理另一篇下载。',
    'browser-unavailable': '无法启动文献浏览器，请确认本机安装了 Chrome 或 Edge，且专用配置目录未被另一个进程占用。',
    'download-failed': '浏览器未取得完整文件，请在文献浏览器中查看下载状态。',
    'manual-save': 'PDF 已在文献浏览器预览，请用阅读器的下载按钮保存。',
    'invalid-file': '站点返回的内容无法确认为 PDF 或 CAJ 文件。',
    'content-mismatch': 'PDF 中的题名或 DOI 与目标文献冲突。',
    'write-error': '无法写入指定的下载目录。',
    'file-exists': '目标文件已经存在。',
};
function siteUrl(provider, value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.port && hostAllowed(provider, value);
    }
    catch {
        return false;
    }
}
async function pageIntervention(page, status) {
    if (page.isClosed())
        return undefined;
    const title = await page.title().catch(() => '');
    const text = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '');
    const notice = title + '\n' + text.slice(0, 5000);
    if (/just a moment|captcha|安全验证|请完成验证|请.{0,8}输入验证码|请.{0,8}滑动验证/i.test(notice))
        return 'captcha';
    if (status === 401 || /(?:^|[/.])(?:login|passport|sso)(?:[/?#.]|$)/i.test(page.url()) ||
        /请.{0,8}先登录|登录后.{0,12}(?:下载|访问)|请.{0,8}完成机构认证/.test(notice))
        return 'login-required';
    if (status === 403 || /暂无下载权限|无权下载|没有访问权限|未订阅|请购买.{0,8}权限/.test(notice))
        return 'access-denied';
    return undefined;
}
async function downloadControl(page, provider, detailUrl) {
    const control = 'a, button, [role=button], [role=link]';
    const selector = ['a', ...DOWNLOAD_REGIONS[provider].flatMap(region => control.split(', ').map(item => region + ' ' + item))].join(', ');
    const elements = await page.locator(selector).elementHandles();
    const labels = await Promise.all(elements.map(element => element.evaluate((node, regions) => {
        if (!(node instanceof Element))
            return undefined;
        const link = node.closest('a');
        return {
            href: link?.getAttribute('href'),
            name: [node.textContent?.trim(), node.getAttribute('aria-label'), node.getAttribute('title')].filter(Boolean).join(' '),
            inRegion: regions.some(region => node.closest(region) !== null),
        };
    }, DOWNLOAD_REGIONS[provider]).catch(() => undefined)));
    const candidates = labels.flatMap((label, index) => {
        if (label === undefined)
            return [];
        const { href, name, inRegion } = label;
        if (/帮助|指南|客户端下载|下载客户端|登录|注销/.test(name))
            return [];
        const hasAction = href !== null && href !== undefined && href !== '' && !href.startsWith('#') && !/^javascript:/i.test(href);
        if (!inRegion && (!hasAction || !/下载/.test(name)))
            return [];
        if (!hasAction && !/下载/.test(name))
            return [];
        const url = hasAction ? URL.parse(href, page.url()) : null;
        if (hasAction && (url === null || !siteUrl(provider, url.href) || url.href.split('#')[0] === detailUrl.split('#')[0]))
            return [];
        const score = scoreDownloadLink(name, url?.href ?? '');
        return score > 0 && elements[index] !== undefined ? [{ element: elements[index], score }] : [];
    }).sort((left, right) => right.score - left.score);
    for (const candidate of candidates) {
        if (await candidate.element.isVisible() && await candidate.element.isEnabled())
            return candidate.element;
    }
    return undefined;
}
async function clickForFile(page, provider, click, signal, tabs, statuses) {
    let preview = false;
    const waiting = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    let deliver = () => { };
    const arrived = new Promise(resolve => { deliver = resolve; });
    const endWait = () => deliver();
    const receiveDownload = (download) => {
        const file = (async () => {
            const cancel = () => { void download.cancel().catch(() => { }); };
            signal.addEventListener('abort', cancel, { once: true });
            try {
                signal.throwIfAborted();
                const url = download.url();
                if (!siteUrl(provider, url) && !(url.startsWith('blob:') && siteUrl(provider, url.slice(5))))
                    throw new Error(messages['invalid-file']);
                const path = await download.path();
                return { url, suggestedName: download.suggestedFilename(), data: await readFile(path, { signal }) };
            }
            finally {
                cancel();
                signal.removeEventListener('abort', cancel);
                await download.delete().catch(() => { });
            }
        })();
        void file.catch(() => { });
        deliver(file);
    };
    const receiveResponse = (response) => {
        if (!response.request().isNavigationRequest())
            return;
        const status = response.status();
        if (status === 401 || status === 403) {
            const tab = response.frame().page();
            if (tabs.has(tab))
                statuses.set(tab, status);
        }
        if (!response.ok() || !siteUrl(provider, response.url()))
            return;
        const headers = response.headers();
        if (!/^application\/(?:pdf|x-pdf)\b/i.test(headers['content-type'] ?? '') ||
            /^\s*attachment\b/i.test(headers['content-disposition'] ?? ''))
            return;
        void response.body().then(data => {
            if (looksLikePdf(data))
                deliver(Promise.resolve({ url: response.url(), data }));
            else
                preview = true;
        }, () => { });
    };
    const watchTab = (tab) => {
        tabs.add(tab);
        tab.on('download', receiveDownload);
        tab.on('response', receiveResponse);
    };
    watchTab(page);
    page.on('popup', watchTab);
    waiting.addEventListener('abort', endWait, { once: true });
    const abortDownload = () => {
        for (const tab of tabs)
            void tab.close().catch(() => { });
    };
    signal.addEventListener('abort', abortDownload, { once: true });
    try {
        signal.throwIfAborted();
        await click().catch(() => { });
        const file = await arrived.catch(() => undefined);
        return { file, preview };
    }
    finally {
        page.off('popup', watchTab);
        for (const tab of tabs) {
            tab.off('download', receiveDownload);
            tab.off('response', receiveResponse);
        }
        waiting.removeEventListener('abort', endWait);
        signal.removeEventListener('abort', abortDownload);
    }
}
function documentFormat(data) {
    if (looksLikePdf(data))
        return 'pdf';
    const magic = new TextDecoder().decode(data.subarray(0, 4));
    return data.length > 4 && /^(?:CAJ\0|HN\0\0|KDH |TEB\0)$/.test(magic) ? 'caj' : undefined;
}
async function launchBrowser(profileDir) {
    const { chromium } = await import('playwright-core');
    if (await mkdir(profileDir, { recursive: true }) !== undefined) {
        // 新配置将站点内联 PDF 交给下载管理器，已有配置保留用户选择。
        const defaultProfile = join(profileDir, 'Default');
        await mkdir(defaultProfile, { recursive: true });
        await writeFile(join(defaultProfile, 'Preferences'), JSON.stringify({
            plugins: { always_open_pdf_externally: true },
        }), { flag: 'wx' });
    }
    for (const channel of ['chrome', 'msedge']) {
        try {
            return await chromium.launchPersistentContext(profileDir, { channel, headless: false, acceptDownloads: true, timeout: 12_000 });
        }
        catch {
            // 尝试系统上安装的另一个浏览器。
        }
    }
    throw new Error(messages['browser-unavailable']);
}
export class ChineseFileDownloader {
    launch;
    context;
    pendingTab;
    busy = false;
    lifecycle = new AbortController();
    constructor(profileDir, launch = () => launchBrowser(profileDir)) {
        this.launch = launch;
    }
    async download(request, callerSignal) {
        const { url, downloadDir } = request;
        const provider = chineseSourceFromUrl(url);
        if (provider === undefined)
            throw new Error('请输入知网、万方或维普的 HTTPS 论文详情页链接');
        if (!isAbsolute(downloadDir))
            throw new Error('downloadDir 必须是运行 MCP 的机器上的绝对路径');
        const base = { provider, detailUrl: url };
        const failure = (status, pageUrl) => ({ ...base, status, message: messages[status], ...(pageUrl ? { pageUrl } : {}) });
        const signal = AbortSignal.any([callerSignal, this.lifecycle.signal]);
        signal.throwIfAborted();
        if (this.busy)
            return failure('browser-busy');
        this.busy = true;
        const tabs = new Set();
        let keepTab;
        try {
            try {
                await prepareDownloadDir(downloadDir);
            }
            catch {
                return failure('write-error');
            }
            signal.throwIfAborted();
            if (this.context === undefined) {
                try {
                    const context = await this.launch();
                    if (signal.aborted) {
                        await context.close();
                        signal.throwIfAborted();
                    }
                    this.context = context;
                    context.once('close', () => { if (this.context === context)
                        this.context = undefined; });
                }
                catch {
                    signal.throwIfAborted();
                    return failure('browser-unavailable');
                }
            }
            const page = await this.context.newPage();
            tabs.add(page);
            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => null);
            const handoff = async (status, tab) => {
                await this.pendingTab?.close().catch(() => { });
                this.pendingTab = keepTab = tab;
                await tab.bringToFront().catch(() => { });
                // 认证跳转可能包含会话参数，调用方可直接操作保留的标签页。
                return failure(status, tab.url().split(/[?#]/, 1)[0]);
            };
            const blocked = await pageIntervention(page, response?.status());
            if (blocked === 'captcha' || response === null || !response.ok() || chineseSourceFromUrl(page.url()) !== provider) {
                return await handoff(blocked ?? 'download-failed', page);
            }
            const selectorTitle = 'meta[name="citation_title"]';
            const title = request.title || await page.locator(selectorTitle).first().getAttribute('content', { timeout: 500 }).catch(() => null) || '';
            let candidate = await downloadControl(page, provider, page.url());
            if (candidate === undefined) {
                await delay(650, undefined, { signal });
                candidate = await downloadControl(page, provider, page.url());
            }
            if (candidate === undefined)
                return await handoff(await pageIntervention(page) ?? blocked ?? 'no-download-link', page);
            const statuses = new Map();
            const { file, preview } = await clickForFile(page, provider, () => candidate.click({ timeout: 5_000 }), signal, tabs, statuses);
            signal.throwIfAborted();
            if (file === undefined) {
                for (const tab of Array.from(tabs).reverse()) {
                    const status = await pageIntervention(tab, statuses.get(tab));
                    if (status !== undefined)
                        return await handoff(status, tab);
                }
                return await handoff(preview ? 'manual-save' : 'download-failed', Array.from(tabs).reverse().find(tab => !tab.isClosed()) ?? page);
            }
            const format = documentFormat(file.data);
            if (format === undefined)
                return failure('invalid-file');
            const paper = { title, source: provider, sourceId: provider, ...(request.doi ? { doi: request.doi } : {}) };
            const pdfVerification = format === 'pdf' ? await verifyPdfContent(file.data, paper) : undefined;
            if (pdfVerification === 'content-mismatch')
                return failure('content-mismatch');
            const suggested = file.suggestedName?.replace(/\.(?:pdf|caj|nh|kdh|teb)$/i, '');
            const name = safeFilename(paper, suggested || title || '论文').replace(/\.pdf$/i, '.' + format);
            const path = join(downloadDir, name);
            signal.throwIfAborted();
            try {
                await saveFileExclusive(path, file.data);
            }
            catch (error) {
                return failure(error.code === 'EEXIST' ? 'file-exists' : 'write-error');
            }
            return { ...base, status: 'downloaded', path, format, sizeBytes: file.data.length, ...(pdfVerification ? { pdfVerification } : {}) };
        }
        finally {
            await Promise.all([...tabs].filter(tab => tab !== keepTab).map(tab => tab.close().catch(() => { })));
            if (keepTab === undefined && this.pendingTab !== undefined && !signal.aborted) {
                await this.pendingTab.close().catch(() => { });
                this.pendingTab = undefined;
            }
            this.busy = false;
        }
    }
    async close() {
        this.lifecycle.abort();
        await this.context?.close().catch(() => { });
    }
}
