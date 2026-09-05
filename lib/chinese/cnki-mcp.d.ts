/**
 * cnki-mcp 的 HTTP MCP 客户端与进程管理器。
 * @module dsh-scholar-search/chinese/cnki-mcp
 */
import type { PaperMeta, SearchQuery } from '../types.js';
export interface CnkiMcpOptions {
    enabled: boolean;
    autoStart: boolean;
    endpoint: string;
    executable: string;
    projectDir: string;
    startupTimeoutMs: number;
    /** 知网业务调用之间的最小间隔。 */
    minIntervalMs: number;
}
/** 管理一个可复用的 cnki-mcp HTTP 服务进程。 */
export declare class CnkiMcpManager {
    private readonly getOptions;
    private sessionId;
    private requestId;
    private process;
    private starting;
    private ready;
    private processError;
    private lastToolCallAt;
    constructor(getOptions: () => CnkiMcpOptions);
    private request;
    private initialize;
    private spawnProcess;
    private ensureReady;
    callTool(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
    search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]>;
    detail(url: string, signal: AbortSignal): Promise<Record<string, unknown>>;
    close(): Promise<void>;
}
