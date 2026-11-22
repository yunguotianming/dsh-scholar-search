import type { BrowserContext } from 'playwright-core';
import type { ChineseProvider } from './browser-workflow.js';
interface FileRequest {
    url: string;
    downloadDir: string;
    title?: string | undefined;
    doi?: string | undefined;
}
type Intervention = 'login-required' | 'captcha' | 'access-denied';
type Failure = Intervention | 'no-download-link' | 'browser-busy' | 'browser-unavailable' | 'download-failed' | 'manual-save' | 'invalid-file' | 'content-mismatch' | 'write-error' | 'file-exists';
export declare class ChineseFileDownloader {
    private readonly launch;
    private context;
    private pendingTab;
    private busy;
    private readonly lifecycle;
    constructor(profileDir: string, launch?: () => Promise<BrowserContext>);
    download(request: FileRequest, callerSignal: AbortSignal): Promise<{
        pageUrl?: string;
        status: Failure;
        message: string;
        provider: ChineseProvider;
        detailUrl: string;
    } | {
        pdfVerification?: "matched" | "unverified";
        status: "downloaded";
        path: string;
        format: "pdf" | "caj";
        sizeBytes: number;
        provider: ChineseProvider;
        detailUrl: string;
    }>;
    close(): Promise<void>;
}
export {};
