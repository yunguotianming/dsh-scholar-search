/**
 * PDF 下载回退链（DESIGN §8）：优先尝试 OA 来源，最后尝试默认可用的灰色渠道。
 * 每一级校验 PDF 文件头和重定向后的 http(s) URL，失败时继续下一级。
 * @module dsh-scholar-search/download
 */
import { mkdir, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { isHttpUrl, normalizeArxivId, normalizeDoi, requestSignal } from './http.js';
import { mergePapers, normalizeTitle } from './paper.js';
import { verifyPdfContent } from './pdf.js';
import { pdfLinksFromLandingPage } from './sources/crossref_page.js';
/** Browser-like headers publisher CDNs accept for PDF downloads. */
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/pdf,application/x-pdf,*/*',
};
/** `%PDF` magic. */
export function looksLikePdf(bytes) {
    return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
/** Candidate PDF URLs derived from an OA publisher landing page (dsh-ai4scholar pattern table). */
export function pdfCandidatesFor(landingUrl) {
    const candidates = [];
    let u;
    try {
        u = new URL(landingUrl);
    }
    catch {
        return candidates;
    }
    const host = u.hostname;
    const path = u.pathname;
    if (host.includes('journals.plos.org')) {
        const id = u.searchParams.get('id');
        if (id !== null)
            candidates.push(`${u.origin}${path.replace(/\/article$/, '/article/file')}?id=${encodeURIComponent(id)}&type=printable`);
    }
    if (host.includes('frontiersin.org') && /\/articles\/10\./.test(path))
        candidates.push(`${u.origin}${path.replace(/\/full$/, '')}/pdf`);
    if (host.includes('mdpi.com')) {
        if (path.endsWith('/htm'))
            candidates.push(`${u.origin}${path.replace(/\/htm$/, '/pdf')}`);
        else if (!path.endsWith('.pdf'))
            candidates.push(`${u.origin}${path.replace(/\/$/, '')}/pdf`);
    }
    if ((host.includes('biorxiv.org') || host.includes('medrxiv.org')) && path.startsWith('/content/')) {
        candidates.push(`${u.origin}${path.replace(/(\.full)?(\.pdf)?$/, '')}.full.pdf`);
    }
    if (host.includes('arxiv.org') && path.startsWith('/abs/'))
        candidates.push(`https://arxiv.org/pdf/${path.slice('/abs/'.length)}`);
    if (host.includes('nature.com')) {
        const m = /\/articles\/(10\.\d+\/[^\s?#]+)/.exec(path);
        if (m !== null)
            candidates.push(`${u.origin}/content/pdf/${m[1]}.pdf`);
    }
    return [...new Set(candidates)];
}
/** Filesystem-safe filename: `{safeTitle}_{year}_{sourceId}.pdf`. */
export function safeFilename(paper, override) {
    if (override !== undefined && override.trim().length > 0) {
        let clean = override.trim().normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/[. ]+$/g, '');
        if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean))
            clean = `_${clean}`;
        clean = Array.from(clean.replace(/\.pdf$/i, '')).slice(0, 180).join('') || 'paper';
        return `${clean}.pdf`;
    }
    const slug = paper.title
        .toLowerCase()
        .replace(/[^a-z0-9一-鿿]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'paper';
    const year = paper.year !== undefined ? `_${paper.year}` : '';
    const id = paper.sourceId.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60);
    return safeFilename(paper, `${slug}${year}_${id}.pdf`);
}
/** 下载前实际试写目标目录；不修改 ACL 或任何默认目录配置。 */
export async function prepareDownloadDir(directory) {
    await mkdir(directory, { recursive: true });
    const probe = join(directory, `.scholar-write-${randomUUID()}.tmp`);
    const handle = await open(probe, 'wx');
    try {
        await handle.writeFile('write-check');
    }
    finally {
        try {
            await handle.close();
        }
        finally {
            await unlink(probe);
        }
    }
}
export async function savePdf(path, bytes) {
    if (!looksLikePdf(bytes))
        throw new Error('响应内容不是 PDF');
    await saveFileExclusive(path, bytes);
}
/** 独占写入，失败时清理本次创建的文件。 */
export async function saveFileExclusive(path, bytes) {
    const handle = await open(path, 'wx');
    try {
        try {
            await handle.writeFile(bytes);
        }
        finally {
            await handle.close();
        }
    }
    catch (error) {
        await unlink(path).catch(() => { });
        throw error;
    }
}
/** Whether this URL is a Europe PMC official endpoint, which 403s intermittently and benefits from a retry. */
function isEuropePmcUrl(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'europepmc.org' || host.endsWith('.europepmc.org');
    }
    catch {
        return false;
    }
}
/** Sleep, respecting caller cancellation. */
function sleep(ms, signal) {
    return new Promise((resolvePromise, reject) => {
        const timer = setTimeout(() => { cleanup(); resolvePromise(); }, ms);
        const onAbort = () => { clearTimeout(timer); cleanup(); const e = new Error('aborted'); e.name = 'AbortError'; reject(e); };
        const cleanup = () => { signal?.removeEventListener('abort', onAbort); };
        if (signal?.aborted === true) {
            onAbort();
            return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
/** Classify a fetch error into a diagnostic reason. */
function classifyError(error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const msg = `${error instanceof Error ? error.message : String(error)} ${cause instanceof Error ? cause.message : ''}`;
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg))
        return { reason: 'dns' };
    if (/timeout|ETIMEDOUT|aborted due to timeout/i.test(msg))
        return { reason: 'timeout' };
    if (/CERT|SSL|TLS|certificate/i.test(msg))
        return { reason: 'network' };
    return { reason: 'network' };
}
/**
 * Fetch one URL and verify it actually serves a PDF. Europe PMC's official
 * endpoint 403s intermittently and is retried up to 3 times with a 2s gap.
 * @param url - candidate PDF URL.
 * @param options - timeout and cancellation.
 * @returns the bytes and final URL, or the failure reason.
 */
export async function fetchPdfBytesDetailed(url, options) {
    if (!isHttpUrl(url))
        return { failure: { reason: 'non-http' } };
    const maxAttempts = isEuropePmcUrl(url) ? 3 : 1;
    let lastFailure = { reason: 'network' };
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        options.signal?.throwIfAborted();
        if (attempt > 0)
            await sleep(2000, options.signal);
        try {
            const res = await fetch(url, {
                headers: BROWSER_HEADERS,
                redirect: 'follow',
                signal: requestSignal(options.signal, options.timeoutMs),
            });
            if (!res.ok) {
                lastFailure = { reason: `http-${res.status}`, status: res.status };
                const body = await res.text();
                if (/cf-chl-|Just a moment|challenge-platform|captcha/i.test(body))
                    return { failure: { reason: 'challenge', status: res.status } };
                if (![403, 429].includes(res.status) && res.status < 500)
                    return { failure: lastFailure };
                continue;
            }
            const finalUrl = res.url.length > 0 ? res.url : url;
            if (!isHttpUrl(finalUrl))
                return { failure: { reason: 'non-http' } };
            const data = new Uint8Array(await res.arrayBuffer());
            if (!looksLikePdf(data)) {
                const decoder = new TextDecoder();
                const prefix = decoder.decode(data.subarray(0, 8192));
                if (/cf-chl-|Just a moment|challenge-platform|captcha/i.test(prefix))
                    return { failure: { reason: 'challenge' } };
                const html = /\btext\/html\b/i.test(res.headers.get('content-type') ?? '') || /<(?:!doctype\s+html|html|head|body|a|meta)\b/i.test(prefix);
                if (options.parseLanding === true && html) {
                    const links = pdfLinksFromLandingPage(decoder.decode(data.subarray(0, 512 * 1024)), finalUrl);
                    return { failure: { reason: 'not-pdf' }, landing: { url: finalUrl, links } };
                }
                return { failure: { reason: 'not-pdf' } };
            }
            return { fetch: { data, finalUrl } };
        }
        catch (error) {
            options.signal?.throwIfAborted();
            lastFailure = classifyError(error);
            continue;
        }
    }
    return { failure: lastFailure };
}
/**
 * Fetch one URL and verify it actually serves a PDF. Returns `undefined` on
 * any HTTP/transport failure, non-http(s) redirect target, or non-PDF body.
 * Europe PMC's official PDF endpoint 403s intermittently — it is retried up to
 * 3 times with a 2s gap (per the field report's findings).
 * @param url - candidate PDF URL.
 * @param options - timeout and cancellation.
 * @returns the bytes and final URL, or `undefined`.
 */
export async function fetchPdfBytes(url, options) {
    const result = await fetchPdfBytesDetailed(url, options);
    return result.fetch;
}
async function* fallbackLevels(paper, registry, signal, attempted, failures, openAccessOnly = false) {
    const seen = new Set();
    const level = (label, urls, landings = []) => {
        attempted.push(label);
        const fresh = (candidates) => candidates.filter((url) => {
            if (url === undefined || !isHttpUrl(url) || seen.has(url))
                return false;
            seen.add(url);
            return true;
        });
        const pdfUrls = fresh(urls);
        const landingUrls = fresh(landings);
        return { label, urls: pdfUrls, ...(landingUrls.length > 0 ? { landingUrls } : {}) };
    };
    const lookup = async (id) => {
        signal.throwIfAborted();
        const source = registry.searchSources.find((s) => s.id === id) ?? registry.linkSources[id];
        try {
            if (source?.resolvePdfLocations !== undefined)
                return await source.resolvePdfLocations(paper, signal);
            const url = await source?.resolvePdf?.(paper, signal);
            return { pdfUrls: url === undefined ? [] : [url], landingUrls: [] };
        }
        catch {
            signal.throwIfAborted();
            failures.push({ source: id, reason: 'lookup-failed' });
            return { pdfUrls: [], landingUrls: [] };
        }
    };
    const sourceLevel = async (id) => {
        const { pdfUrls, landingUrls } = await lookup(id);
        return level(id, pdfUrls, landingUrls);
    };
    // 按需查找并立刻下载；命中后不再请求后续来源。
    yield await sourceLevel('europe_pmc');
    yield level('direct', [paper.openAccessPdfUrl]);
    yield await sourceLevel('openalex');
    yield await sourceLevel('unpaywall');
    yield await sourceLevel('semantic_scholar');
    const direct = [];
    const arxivId = normalizeArxivId(paper.arxivId);
    if (arxivId !== undefined)
        direct.push(`https://arxiv.org/pdf/${arxivId}`);
    const doi = normalizeDoi(paper.doi);
    if (doi !== undefined && /^10\.(1101|64898)\//.test(doi)) {
        direct.push(...(await lookup('biorxiv')).pdfUrls);
    }
    if (doi !== undefined && /^10\.48550\/arxiv\./i.test(doi)) {
        direct.push(`https://arxiv.org/pdf/${doi.replace(/^10\.48550\/arxiv\./i, '')}`);
    }
    yield level('preprint', direct);
    yield await sourceLevel('openaire');
    yield await sourceLevel('core');
    if (openAccessOnly)
        return;
    yield await sourceLevel('crossref_page');
    if (paper.landingPageUrl !== undefined)
        yield level('publisher_patterns', pdfCandidatesFor(paper.landingPageUrl));
    yield await sourceLevel('grayarea');
}
export async function buildFallbackChain(paper, registry, signal, options) {
    const levels = [];
    const attempted = [];
    for await (const level of fallbackLevels(paper, registry, signal, attempted, [], options?.openAccessOnly)) {
        if (level.urls.length > 0 || level.landingUrls !== undefined)
            levels.push(level);
    }
    signal.throwIfAborted();
    return { levels, attempted };
}
/** 从题录整理可直接交给研究者的链接。 */
export function paperLandingLinks(paper) {
    const doi = normalizeDoi(paper.doi);
    const doiUrl = doi === undefined ? undefined : 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/');
    return [...new Set([paper.landingPageUrl, doiUrl, paper.openAccessPdfUrl].filter((url) => url !== undefined && isHttpUrl(url)))];
}
/** 依次尝试全文位置，验证候选并保存 PDF。 */
export async function downloadPaper(paper, options, signal) {
    signal.throwIfAborted();
    try {
        await prepareDownloadDir(options.downloadDir);
    }
    catch (error) {
        return { error: 'write-error', triedSources: [], message: `目标目录无法写入：${error instanceof Error ? error.message : String(error)}` };
    }
    let metadata;
    if (options.verifyMetadata === true) {
        const doi = normalizeDoi(paper.doi);
        const source = options.registry.searchSources.find((item) => item.id === 'crossref');
        if (doi === undefined || source === undefined) {
            return { error: 'metadata-unverified', triedSources: [], message: '著录核对需要有效 DOI 和 Crossref 来源，本次未下载。' };
        }
        const records = await source.search({ query: doi, limit: 1 }, signal).catch(() => { signal.throwIfAborted(); return []; });
        metadata = records.find((item) => normalizeDoi(item.doi) === doi);
        if (metadata === undefined)
            return { error: 'metadata-unverified', triedSources: ['metadata:crossref'], message: 'Crossref 未返回该 DOI 的精确记录；可能未登记或查询失败，本次未下载。' };
        const expected = normalizeTitle(paper.title);
        const actual = normalizeTitle(metadata.title);
        const identifierOnly = normalizeDoi(paper.title) === doi;
        if (!identifierOnly && expected !== actual && !expected.startsWith(`${actual} `) && !actual.startsWith(`${expected} `)) {
            return { error: 'metadata-mismatch', triedSources: ['metadata:crossref'], metadata, message: `DOI 对应标题与预期不符，本次未下载。预期：${paper.title}；Crossref：${metadata.title}` };
        }
        paper = { ...mergePapers(paper, metadata), title: metadata.title };
    }
    const triedSources = [];
    const failures = [];
    const attempts = [];
    const landingLinks = new Set();
    const directLinks = new Set();
    const fetchedUrls = new Set();
    const mismatched = new Set();
    for await (const level of fallbackLevels(paper, options.registry, signal, triedSources, attempts)) {
        const isOpenLevel = level.label !== 'grayarea';
        const candidates = [
            ...level.urls.map((url) => ({ url, parseLanding: isOpenLevel, landing: false })),
            ...(level.landingUrls ?? []).map((url) => ({ url, parseLanding: true, landing: true })),
        ];
        for (const { url, parseLanding, landing } of candidates) {
            signal.throwIfAborted();
            if (isOpenLevel)
                (landing ? landingLinks : directLinks).add(url);
            if (fetchedUrls.has(url))
                continue;
            fetchedUrls.add(url);
            const detailed = await fetchPdfBytesDetailed(url, { timeoutMs: options.pdfTimeoutMs, signal, parseLanding });
            if (detailed.landing !== undefined) {
                landingLinks.add(detailed.landing.url);
                fetchedUrls.add(detailed.landing.url);
                for (const link of detailed.landing.links)
                    candidates.push({ url: link, parseLanding: false, landing: false });
            }
            let fetched = detailed.fetch;
            if (detailed.failure !== undefined)
                attempts.push({ source: level.label, url, ...detailed.failure });
            if (fetched === undefined && !landing && !detailed.landing?.links.length && options.browser !== undefined) {
                const viaBrowser = await options.browser.fetchPdf(url, { downloadDir: options.downloadDir, timeoutMs: options.pdfTimeoutMs, signal }).catch(() => undefined);
                if (viaBrowser !== undefined && looksLikePdf(viaBrowser.data) && isHttpUrl(viaBrowser.finalUrl)) {
                    fetched = viaBrowser;
                }
            }
            if (fetched === undefined) {
                failures.push(`${level.label}:${new URL(url).hostname}(${detailed.failure?.reason ?? 'network'})`);
                continue;
            }
            signal.throwIfAborted();
            const pdfVerification = await verifyPdfContent(fetched.data, paper);
            signal.throwIfAborted();
            if (pdfVerification === 'content-mismatch') {
                mismatched.add(url);
                mismatched.add(fetched.finalUrl);
                attempts.push({ source: level.label, url: fetched.finalUrl, reason: 'content-mismatch' });
                failures.push(`${level.label}:${new URL(fetched.finalUrl).hostname}(content-mismatch)`);
                continue;
            }
            const filename = safeFilename(paper, options.filename);
            const path = join(options.downloadDir, filename);
            try {
                await savePdf(path, fetched.data);
            }
            catch (error) {
                const exists = error.code === 'EEXIST';
                return { error: exists ? 'file-exists' : 'write-error', triedSources, attempts, message: `PDF 未保存：${error instanceof Error ? error.message : String(error)}` };
            }
            return { path: resolve(path), source: level.label, url: fetched.finalUrl, sizeBytes: fetched.data.length, attempts, pdfVerification, ...(metadata !== undefined ? { metadata } : {}) };
        }
    }
    signal.throwIfAborted();
    const manualLinks = [...new Set([...landingLinks, ...paperLandingLinks(paper), ...directLinks])].filter((url) => !mismatched.has(url));
    return {
        error: mismatched.size > 0 ? 'content-mismatch' : 'no-free-fulltext',
        triedSources, attempts, manualLinks,
        failureKind: failures.length > 0 ? 'candidates-failed' : attempts.length > 0 ? 'lookup-failed' : 'no-candidate',
        ...(failures.length > 0 ? { failures } : {}),
    };
}
