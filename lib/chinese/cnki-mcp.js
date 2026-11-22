/**
 * cnki-mcp 的 HTTP MCP 客户端与进程管理器。
 * @module dsh-scholar-search/chinese/cnki-mcp
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { buildThrottle } from '../throttle.js';
import { splitList } from './browser-workflow.js';
export const CNKI_MCP_DEFAULTS = {
    endpoint: 'http://127.0.0.1:7788/mcp',
    executable: 'uv',
    projectDir: fileURLToPath(new URL('../../vendor/cnki-mcp', import.meta.url)),
    startupTimeoutMs: 30_000,
    minIntervalMs: 3_000,
};
function parseResponse(text) {
    const trimmed = text.trim();
    if (trimmed.length === 0)
        throw new Error('cnki-mcp returned an empty MCP response');
    try {
        return JSON.parse(trimmed);
    }
    catch {
        const data = trimmed
            .split(/\r?\n/)
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim())
            .filter(Boolean)
            .at(-1);
        if (data === undefined)
            throw new Error('cnki-mcp returned an invalid MCP response');
        return JSON.parse(data);
    }
}
function textValue(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function recordValue(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function extractToolValue(value) {
    const record = recordValue(value);
    const content = record?.content;
    const text = (Array.isArray(content) ? content : [])
        .map(item => recordValue(item)?.text)
        .find(item => typeof item === 'string');
    if (record?.isError === true)
        throw new Error(textValue(text) ?? '知网服务返回工具错误');
    const structured = record?.structuredContent;
    if (structured !== undefined) {
        const wrapper = recordValue(structured);
        return wrapper !== undefined && Object.keys(wrapper).length === 1 && Object.hasOwn(wrapper, 'result')
            ? wrapper.result
            : structured;
    }
    if (!Array.isArray(content))
        return value;
    if (typeof text !== 'string')
        return value;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function normalizeYear(value) {
    if (typeof value === 'number' && Number.isInteger(value))
        return value;
    const text = textValue(value);
    if (text === undefined)
        return undefined;
    const match = text.match(/\b(\d{4})\b/);
    return match === null ? undefined : Number(match[1]);
}
/** 把知网详情转换成插件通用的题录格式。 */
export function paperFromCnkiRecord(raw, url) {
    const title = textValue(raw.title) ?? url;
    const paper = { title, source: 'cnki_mcp', sourceId: url, landingPageUrl: url };
    if (Array.isArray(raw.authors)) {
        const authors = raw.authors.map(textValue).filter((author) => author !== undefined);
        if (authors.length > 0)
            paper.authors = authors;
    }
    const venue = textValue(raw.journal) ?? textValue(raw.source);
    if (venue !== undefined)
        paper.venue = venue;
    for (const field of ['abstract', 'doi', 'volume', 'issue', 'pages']) {
        const value = textValue(raw[field]);
        if (value !== undefined)
            paper[field] = value;
    }
    if (Array.isArray(raw.keywords)) {
        const keywords = raw.keywords.map(textValue).filter((keyword) => keyword !== undefined);
        if (keywords.length > 0)
            paper.keywords = keywords;
    }
    const organizations = splitList(textValue(raw.institution));
    if (organizations.length > 0)
        paper.organizations = organizations;
    const year = normalizeYear(raw.year);
    if (year !== undefined)
        paper.year = year;
    return paper;
}
export async function readCnkiPaper(manager, url, signal) {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://kns.cnki.net' || parsed.username || parsed.password ||
        !['/kcms2/article/abstract', '/kcms/detail/detail.aspx'].includes(parsed.pathname.toLowerCase())) {
        throw new Error('需要知网检索返回的 HTTPS 论文详情页地址');
    }
    const raw = await manager.detail(url, signal);
    if (textValue(raw.title) === undefined)
        throw new Error(textValue(raw.error) ?? '知网未返回论文题名，请从检索结果重新打开详情');
    return paperFromCnkiRecord(raw, url);
}
function normalizeResult(value, index) {
    const record = recordValue(value);
    if (record === undefined)
        return undefined;
    const title = textValue(record.title);
    const url = textValue(record.url) ?? textValue(record.detail_url);
    if (title === undefined || url === undefined)
        return undefined;
    const rawAuthors = record.authors;
    const authors = Array.isArray(rawAuthors)
        ? rawAuthors.map(textValue).filter((item) => item !== undefined)
        : typeof rawAuthors === 'string'
            ? rawAuthors.split(/[;；、]/).map(item => item.trim()).filter(Boolean)
            : [];
    const paper = {
        title,
        source: 'cnki_mcp',
        sourceId: url || `cnki-${index + 1}`,
        landingPageUrl: url,
    };
    const journal = textValue(record.journal) ?? textValue(record.source);
    const date = textValue(record.date);
    if (authors.length > 0)
        paper.authors = authors;
    if (journal !== undefined)
        paper.venue = journal;
    const year = normalizeYear(record.year ?? date);
    if (year !== undefined)
        paper.year = year;
    const abstract = textValue(record.abstract);
    if (abstract !== undefined)
        paper.abstract = abstract;
    const doi = textValue(record.doi);
    if (doi !== undefined)
        paper.doi = doi;
    return paper;
}
/** 管理一个可复用的 cnki-mcp HTTP 服务进程。 */
export class CnkiMcpManager {
    getOptions;
    sessionId;
    protocolVersion;
    requestId = 0;
    process;
    starting;
    ready = false;
    processError;
    lifecycle = new AbortController();
    throttle = buildThrottle(() => ({}), () => this.getOptions().minIntervalMs);
    constructor(getOptions) {
        this.getOptions = getOptions;
    }
    async request(method, params, signal) {
        const options = this.getOptions();
        const notification = method.startsWith('notifications/');
        const body = JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++this.requestId }), method, ...(params === undefined ? {} : { params }) });
        const headers = {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
        };
        if (this.sessionId !== undefined)
            headers['mcp-session-id'] = this.sessionId;
        if (this.protocolVersion !== undefined)
            headers['mcp-protocol-version'] = this.protocolVersion;
        const response = await fetch(options.endpoint, { method: 'POST', headers, body, signal });
        const session = response.headers.get('mcp-session-id');
        if (session !== null && session.length > 0)
            this.sessionId = session;
        if (!response.ok)
            throw new Error(`cnki-mcp HTTP ${response.status}`);
        if (notification)
            return undefined;
        const envelope = parseResponse(await response.text());
        if (envelope.error !== undefined)
            throw new Error(envelope.error.message ?? 'cnki-mcp request failed');
        return envelope.result;
    }
    async initialize(signal) {
        this.sessionId = undefined;
        this.protocolVersion = undefined;
        const result = await this.request('initialize', {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'dsh-scholar-search', version: '0.3.1' },
        }, signal);
        this.protocolVersion = textValue(recordValue(result)?.protocolVersion) ?? '2025-06-18';
        await this.request('notifications/initialized', undefined, signal);
    }
    spawnProcess() {
        const options = this.getOptions();
        if (options.projectDir.trim() === '')
            throw new Error('cnki-mcp projectDir is not configured');
        const port = new URL(options.endpoint).port || '7788';
        const child = spawn(options.executable, [
            'run', 'cnki-mcp', 'serve', '--transport', 'http', '--host', '127.0.0.1', '--port', port,
        ], { cwd: options.projectDir, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout?.on('data', () => undefined);
        child.stderr?.on('data', (chunk) => {
            this.processError = chunk.toString('utf8').trim().slice(-500);
        });
        child.once('error', error => {
            this.processError = error.message;
            if (this.process === child)
                this.process = undefined;
        });
        child.once('exit', () => {
            if (this.process === child)
                this.process = undefined;
        });
        this.process = child;
    }
    async ensureReady(signal) {
        signal.throwIfAborted();
        if (this.ready)
            return;
        if (this.starting !== undefined)
            return this.starting;
        this.starting = (async () => {
            try {
                await this.initialize(signal);
                this.ready = true;
                return;
            }
            catch (firstError) {
                signal.throwIfAborted();
                const options = this.getOptions();
                if (!options.autoStart)
                    throw firstError;
                const endpoint = new URL(options.endpoint);
                if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname))
                    throw firstError;
                this.processError = undefined;
                if (this.process === undefined)
                    this.spawnProcess();
                const startupSignal = AbortSignal.any([signal, AbortSignal.timeout(options.startupTimeoutMs)]);
                let lastError = firstError;
                while (!startupSignal.aborted) {
                    try {
                        await this.initialize(startupSignal);
                        this.ready = true;
                        return;
                    }
                    catch (error) {
                        lastError = error;
                        if (this.processError !== undefined && this.process === undefined)
                            break;
                        await delay(500, undefined, { signal: startupSignal }).catch(() => undefined);
                    }
                }
                signal.throwIfAborted();
                const detail = this.processError ?? (lastError instanceof Error ? lastError.message : String(lastError));
                throw new Error(`cnki-mcp startup timed out: ${detail}`);
            }
        })().finally(() => { this.starting = undefined; });
        return this.starting;
    }
    async callTool(name, args, signal) {
        const options = this.getOptions();
        if (!options.enabled)
            throw new Error('cnki-mcp source is disabled');
        const requestSignal = AbortSignal.any([signal, this.lifecycle.signal]);
        await this.ensureReady(requestSignal);
        await this.throttle.wait('cnki', requestSignal);
        requestSignal.throwIfAborted();
        let result;
        try {
            result = await this.request('tools/call', { name, arguments: args }, requestSignal);
        }
        catch (error) {
            this.ready = false;
            throw error;
        }
        return extractToolValue(result);
    }
    async search(query, signal) {
        const value = await this.callTool('easy-search', {
            keywords: query.query,
            limit: Math.min(Math.max(1, query.limit ?? 10), 50),
        }, signal);
        if (!Array.isArray(value))
            return [];
        return value.map(normalizeResult).filter((item) => item !== undefined);
    }
    async detail(url, signal) {
        const value = await this.callTool('get-info-from-url', { url }, signal);
        return recordValue(value) ?? { url, error: 'cnki-mcp returned no metadata' };
    }
    async close() {
        this.lifecycle.abort();
        const child = this.process;
        this.process = undefined;
        this.sessionId = undefined;
        this.protocolVersion = undefined;
        this.ready = false;
        this.processError = undefined;
        if (child !== undefined && child.exitCode === null)
            child.kill();
    }
}
