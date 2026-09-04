/**
 * Browser-based PDF download via Playwright. Launched lazily on first use and
 * reused for the plugin lifetime. Uses the system Chrome/Edge (channel) or a
 * user-supplied executable; never downloads a bundled Chromium.
 * @module dsh-scholar-search/browser
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { looksLikePdf } from './download.js';
/**
 * Lazily-launched browser downloader. One shared headless browser; each
 * download gets a fresh context (isolated cookies) that is closed after.
 */
export class BrowserDownloader {
    options;
    browser;
    launching;
    failed;
    /**
     * @param options.executablePath - explicit browser binary (Chrome/Edge); absent probes channels.
     * @param options.headless - run headless (default true).
     */
    constructor(options = {}) {
        this.options = options;
    }
    /** Whether a browser is available. False once a launch has failed. */
    get available() {
        return this.failed === undefined;
    }
    async ensure() {
        if (this.failed !== undefined)
            throw this.failed;
        if (this.browser !== undefined)
            return this.browser;
        if (this.launching === undefined) {
            this.launching = this.launch().catch((error) => {
                this.failed = error instanceof Error ? error : new Error(String(error));
                this.launching = undefined;
                throw this.failed;
            });
        }
        return this.launching;
    }
    async launch() {
        // playwright-core is a runtime dependency; imported lazily so a missing
        // browser never breaks plugin load.
        const pw = await import('playwright-core');
        const headless = this.options.headless !== false;
        const attempts = [];
        if (this.options.executablePath !== undefined && this.options.executablePath.length > 0) {
            attempts.push({ headless, executablePath: this.options.executablePath });
        }
        // Probe the system Chrome and Edge channels in order.
        attempts.push({ headless, channel: 'chrome' }, { headless, channel: 'msedge' });
        let lastError;
        for (const launchOptions of attempts) {
            try {
                const browser = await pw.chromium.launch(launchOptions);
                this.browser = browser;
                return browser;
            }
            catch (error) {
                lastError = error;
            }
        }
        throw new Error(`no browser available (tried ${attempts.length} launch configs): ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
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
    async fetchPdf(url, options) {
        let browser;
        try {
            browser = await this.ensure();
        }
        catch {
            return undefined;
        }
        let context;
        try {
            context = await browser.newContext({
                acceptDownloads: true,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            });
            const page = await context.newPage();
            const signal = options.signal;
            const onAbort = () => { void context?.close().catch(() => { }); };
            if (signal?.aborted === true) {
                onAbort();
                return undefined;
            }
            signal?.addEventListener('abort', onAbort, { once: true });
            try {
                return await this.fetchWithPage(page, url, options);
            }
            finally {
                signal?.removeEventListener('abort', onAbort);
            }
        }
        catch {
            return undefined;
        }
        finally {
            if (context !== undefined)
                await context.close().catch(() => { });
        }
    }
    async fetchWithPage(page, url, options) {
        page.setDefaultTimeout(options.timeoutMs);
        // Strategy 1: wait for a download event while navigating.
        const downloadPromise = page.waitForEvent('download', { timeout: options.timeoutMs }).catch(() => undefined);
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs }).catch(() => undefined);
        const download = await downloadPromise;
        if (download !== undefined && download !== null) {
            const suggested = download.suggestedFilename();
            await mkdir(options.downloadDir, { recursive: true });
            const tmpPath = join(options.downloadDir, `.browser-${Date.now()}-${suggested}`);
            await download.saveAs(tmpPath);
            const { readFile, unlink } = await import('node:fs/promises');
            const bytes = new Uint8Array(await readFile(tmpPath));
            await unlink(tmpPath).catch(() => { });
            if (looksLikePdf(bytes))
                return { data: bytes, finalUrl: download.url() };
            return undefined;
        }
        // Strategy 2: the navigation response itself is the PDF (inline render).
        if (response !== undefined && response !== null && response.ok()) {
            const body = await response.body().catch(() => undefined);
            if (body !== undefined) {
                const bytes = new Uint8Array(body);
                if (looksLikePdf(bytes))
                    return { data: bytes, finalUrl: response.url() };
            }
        }
        return undefined;
    }
    /** Close the shared browser. Called on plugin dispose. */
    async close() {
        if (this.browser !== undefined)
            await this.browser.close().catch(() => { });
        this.browser = undefined;
        this.launching = undefined;
    }
}
