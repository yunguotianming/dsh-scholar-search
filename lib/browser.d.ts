/**
 * Browser-based PDF download via Playwright. Launched lazily on first use and
 * reused for the plugin lifetime. Uses the system Chrome/Edge (channel) or a
 * user-supplied executable; never downloads a bundled Chromium.
 * @module dsh-scholar-search/browser
 */
/** A fetched PDF's bytes and the final URL after redirects. */
export interface BrowserFetch {
    data: Uint8Array;
    finalUrl: string;
}
/**
 * Lazily-launched browser downloader. One shared headless browser; each
 * download gets a fresh context (isolated cookies) that is closed after.
 */
export declare class BrowserDownloader {
    private readonly options;
    private browser;
    private launching;
    private failed;
    /**
     * @param options.executablePath - explicit browser binary (Chrome/Edge); absent probes channels.
     * @param options.headless - run headless (default true).
     */
    constructor(options?: {
        executablePath?: string | undefined;
        headless?: boolean | undefined;
    });
    /** Whether a browser is available. False once a launch has failed. */
    get available(): boolean;
    private ensure;
    private launch;
    /**
     * Download one URL through a real browser page. Tries two strategies:
     * 1. Playwright's download event (the site serves a Content-Disposition PDF).
     * 2. A direct navigation whose response body is captured when the site
     *    renders the PDF inline (no download event fires).
     * @param url - the PDF (or PDF-serving) URL.
     * @param options.downloadDir - where a download-event file is persisted.
     * @param options.timeoutMs - total budget for the attempt.
     * @param options.signal - caller cancellation.
     * @returns the bytes and final URL, or `undefined` when neither strategy yields a PDF.
     */
    fetchPdf(url: string, options: {
        downloadDir: string;
        timeoutMs: number;
        signal?: AbortSignal | undefined;
    }): Promise<BrowserFetch | undefined>;
    private fetchWithPage;
    /** Close the shared browser. Called on plugin dispose. */
    close(): Promise<void>;
}
