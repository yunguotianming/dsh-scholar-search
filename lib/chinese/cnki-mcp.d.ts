/**
 * cnki-mcp 的 HTTP MCP 客户端与进程管理器。
 * @module dsh-scholar-search/chinese/cnki-mcp
 */
import type { PaperMeta, SearchQuery } from '../types.js';
export declare const CNKI_MCP_DEFAULTS: {
    endpoint: string;
    executable: string;
    projectDir: string;
    startupTimeoutMs: number;
    minIntervalMs: number;
};
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
/** 把知网详情转换成插件通用的题录格式。 */
export declare function paperFromCnkiRecord(raw: Record<string, unknown>, url: string): PaperMeta;
export declare function readCnkiPaper(manager: CnkiMcpManager, url: string, signal: AbortSignal): Promise<PaperMeta>;
/** 管理一个可复用的 cnki-mcp HTTP 服务进程。 */
export declare class CnkiMcpManager {
    private readonly getOptions;
    private sessionId;
    private protocolVersion;
    private requestId;
    private process;
    private starting;
    private ready;
    private processError;
    private readonly lifecycle;
    private readonly throttle;
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
