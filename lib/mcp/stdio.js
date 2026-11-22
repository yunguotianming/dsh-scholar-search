#!/usr/bin/env node
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { CNKI_MCP_DEFAULTS, CnkiMcpManager } from '../chinese/cnki-mcp.js';
import { ChineseFileDownloader } from '../chinese/file-download.js';
import { buildSources, SEARCH_SOURCE_IDS } from '../sources/index.js';
import { createScholarMcp } from './server.js';
const { name, version } = createRequire(import.meta.url)('../../package.json');
const env = (key) => process.env[key]?.trim() || undefined;
const registry = buildSources({
    fetchOptions: () => ({ timeoutMs: 8_000, email: env('SCHOLAR_EMAIL') }),
    semanticScholarApiKey: () => env('SCHOLAR_SEMANTIC_SCHOLAR_API_KEY'),
    pubmedApiKey: () => env('SCHOLAR_PUBMED_API_KEY'),
    coreApiKey: () => env('SCHOLAR_CORE_API_KEY'),
    googleScholarApiKey: () => env('SCHOLAR_GOOGLE_SCHOLAR_API_KEY'),
    grayAreaMirrors: () => [],
});
const cnkiEndpoint = env('SCHOLAR_CNKI_ENDPOINT');
const cnkiMcp = new CnkiMcpManager(() => ({
    ...CNKI_MCP_DEFAULTS,
    enabled: true,
    // 显式指定端点时，由已有服务的启动方负责其生命周期。
    autoStart: cnkiEndpoint === undefined,
    endpoint: cnkiEndpoint ?? CNKI_MCP_DEFAULTS.endpoint,
    executable: env('SCHOLAR_CNKI_UV') ?? CNKI_MCP_DEFAULTS.executable,
}));
const transport = new StdioServerTransport();
const profileDir = env('SCHOLAR_CHINESE_BROWSER_PROFILE') ?? join(homedir(), '.dsh-scholar-search', 'browser');
const chineseDownloader = new ChineseFileDownloader(profileDir);
if (!isAbsolute(profileDir)) {
    console.error('SCHOLAR_CHINESE_BROWSER_PROFILE 必须是绝对路径');
    process.exit(1);
}
serveStdio(() => createScholarMcp({ registry, enabledSources: () => [...SEARCH_SOURCE_IDS], toolTimeoutMs: 30_000, cnkiMcp, chineseDownloader }, { name, version }), { transport, onerror: (error) => console.error(error.message) });
const closeTransport = transport.onclose;
transport.onclose = () => {
    closeTransport?.();
    void cnkiMcp.close();
    void chineseDownloader.close();
};
