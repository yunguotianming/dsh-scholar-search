import { McpServer } from '@modelcontextprotocol/server';
import type { Implementation } from '@modelcontextprotocol/server';
import type { CnkiMcpManager } from '../chinese/cnki-mcp.js';
import type { ChineseFileDownloader } from '../chinese/file-download.js';
import type { SearchRuntime } from '../search.js';
export declare function createScholarMcp(runtime: SearchRuntime & {
    toolTimeoutMs: number;
    cnkiMcp?: CnkiMcpManager;
    chineseDownloader?: Pick<ChineseFileDownloader, 'download'>;
}, info: Pick<Implementation, 'name' | 'version'>): McpServer;
