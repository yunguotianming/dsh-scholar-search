/**
 * cnki-mcp 的 HTTP MCP 客户端与进程管理器。
 * @module dsh-scholar-search/chinese/cnki-mcp
 */
import { spawn } from 'node:child_process';
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
    const structured = record?.structuredContent;
    if (structured !== undefined)
        return structured;
    const content = record?.content;
    if (!Array.isArray(content))
        return value;
    const text = content
        .map(item => recordValue(item)?.text)
        .find(item => typeof item === 'string');
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
    requestId = 0;
    process;
    starting;
    ready = false;
    processError;
    lastToolCallAt = 0;
    constructor(getOptions) {
        this.getOptions = getOptions;
    }
    async request(method, params, signal) {
        const options = this.getOptions();
        const body = JSON.stringify({ jsonrpc: '2.0', id: ++this.requestId, method, ...(params === undefined ? {} : { params }) });
        const headers = {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
        };
        if (this.sessionId !== undefined)
            headers['mcp-session-id'] = this.sessionId;
        const response = await fetch(options.endpoint, { method: 'POST', headers, body, signal });
        const session = response.headers.get('mcp-session-id');
        if (session !== null && session.length > 0)
            this.sessionId = session;
        if (!response.ok)
            throw new Error(`cnki-mcp HTTP ${response.status}`);
        const envelope = parseResponse(await response.text());
        if (envelope.error !== undefined)
            throw new Error(envelope.error.message ?? 'cnki-mcp request failed');
        return envelope.result;
    }
    async initialize(signal) {
        await this.request('initialize', {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'dsh-scholar-search', version: '0.2.0' },
        }, signal);
        await this.request('notifications/initialized', undefined, signal).catch(() => undefined);
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
                const options = this.getOptions();
                if (!options.autoStart)
                    throw firstError;
                if (this.process === undefined)
                    this.spawnProcess();
                const deadline = Date.now() + options.startupTimeoutMs;
                let lastError = firstError;
                while (Date.now() < deadline) {
                    try {
                        await this.initialize(signal);
                        this.ready = true;
                        return;
                    }
                    catch (error) {
                        lastError = error;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
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
        await this.ensureReady(signal);
        const waitMs = options.minIntervalMs - (Date.now() - this.lastToolCallAt);
        if (waitMs > 0)
            await new Promise((resolve, reject) => {
                const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
                const timer = setTimeout(finish, waitMs);
                const abort = () => { clearTimeout(timer); reject(signal.reason ?? new Error('aborted')); };
                if (signal.aborted) {
                    abort();
                    return;
                }
                signal.addEventListener('abort', abort, { once: true });
            });
        if (signal.aborted)
            throw signal.reason ?? new Error('aborted');
        this.lastToolCallAt = Date.now();
        try {
            const result = await this.request('tools/call', { name, arguments: args }, signal);
            return extractToolValue(result);
        }
        catch (error) {
            this.ready = false;
            throw error;
        }
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
        const child = this.process;
        this.process = undefined;
        this.sessionId = undefined;
        this.ready = false;
        this.processError = undefined;
        this.lastToolCallAt = 0;
        if (child !== undefined && child.exitCode === null)
            child.kill();
    }
}
