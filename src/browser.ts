/**
 * Browser-based PDF download via Playwright. Launched lazily on first use and
 * reused for the plugin lifetime. Uses the system Chrome/Edge (channel) or a
 * user-supplied executable; never downloads a bundled Chromium.
 * @module dsh-scholar-search/browser
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { looksLikePdf } from './download.js'

/** Playwright's surface is typed `any` — playwright-core has no shipped types in this layout. */
type Browser = any
type BrowserContext = any
type Page = any

/** A fetched PDF's bytes and the final URL after redirects. */
export interface BrowserFetch {
  data: Uint8Array
  finalUrl: string
}

/**
 * Lazily-launched browser downloader. One shared headless browser; each
 * download gets a fresh context (isolated cookies) that is closed after.
 */
export class BrowserDownloader {
  private browser: Browser | undefined
  private launching: Promise<Browser> | undefined
  private failed: Error | undefined

  /**
   * @param options.executablePath - explicit browser binary (Chrome/Edge); absent probes channels.
   * @param options.headless - run headless (default true).
   */
  constructor(private readonly options: { executablePath?: string | undefined; headless?: boolean | undefined } = {}) {}

  /** Whether a browser is available. False once a launch has failed. */
  get available(): boolean {
    return this.failed === undefined
  }

  private async ensure(): Promise<Browser> {
    if (this.failed !== undefined) throw this.failed
    if (this.browser !== undefined) return this.browser
    if (this.launching === undefined) {
      this.launching = this.launch().catch((error: unknown) => {
        this.failed = error instanceof Error ? error : new Error(String(error))
        this.launching = undefined
        throw this.failed
      })
    }
    return this.launching
  }

  private async launch(): Promise<Browser> {
    // playwright-core is a runtime dependency; imported lazily so a missing
    // browser never breaks plugin load.
    const pw = await import('playwright-core')
    const headless = this.options.headless !== false
    const attempts: Record<string, unknown>[] = []
    if (this.options.executablePath !== undefined && this.options.executablePath.length > 0) {
      attempts.push({ headless, executablePath: this.options.executablePath })
    }
    // Probe the system Chrome and Edge channels in order.
    attempts.push({ headless, channel: 'chrome' }, { headless, channel: 'msedge' })
    let lastError: unknown
    for (const launchOptions of attempts) {
      try {
        const browser: Browser = await pw.chromium.launch(launchOptions)
        this.browser = browser
        return browser
      } catch (error) {
        lastError = error
      }
    }
    throw new Error(`no browser available (tried ${attempts.length} launch configs): ${lastError instanceof Error ? lastError.message : String(lastError)}`)
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
  async fetchPdf(url: string, options: { downloadDir: string; timeoutMs: number; signal?: AbortSignal | undefined }): Promise<BrowserFetch | undefined> {
    let browser: Browser
    try {
      browser = await this.ensure()
    } catch {
      return undefined
    }
    let context: BrowserContext | undefined
    try {
      context = await browser.newContext({
        acceptDownloads: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      })
      const page: Page = await context.newPage()
      const signal = options.signal
      const onAbort = () => { void context?.close().catch(() => {}) }
      if (signal?.aborted === true) { onAbort(); return undefined }
      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        return await this.fetchWithPage(page, url, options)
      } finally {
        signal?.removeEventListener('abort', onAbort)
      }
    } catch {
      return undefined
    } finally {
      if (context !== undefined) await context.close().catch(() => {})
    }
  }

  private async fetchWithPage(page: Page, url: string, options: { downloadDir: string; timeoutMs: number }): Promise<BrowserFetch | undefined> {
    page.setDefaultTimeout(options.timeoutMs)
    // Strategy 1: wait for a download event while navigating.
    const downloadPromise = page.waitForEvent('download', { timeout: options.timeoutMs }).catch(() => undefined)
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs }).catch(() => undefined)
    const download = await downloadPromise
    if (download !== undefined && download !== null) {
      const suggested = download.suggestedFilename()
      await mkdir(options.downloadDir, { recursive: true })
      const tmpPath = join(options.downloadDir, `.browser-${Date.now()}-${suggested}`)
      await download.saveAs(tmpPath)
      const { readFile, unlink } = await import('node:fs/promises')
      const bytes = new Uint8Array(await readFile(tmpPath))
      await unlink(tmpPath).catch(() => {})
      if (looksLikePdf(bytes)) return { data: bytes, finalUrl: download.url() }
      return undefined
    }
    // Strategy 2: the navigation response itself is the PDF (inline render).
    if (response !== undefined && response !== null && response.ok()) {
      const body = await response.body().catch(() => undefined)
      if (body !== undefined) {
        const bytes = new Uint8Array(body)
        if (looksLikePdf(bytes)) return { data: bytes, finalUrl: response.url() }
      }
    }
    return undefined
  }

  /** Close the shared browser. Called on plugin dispose. */
  async close(): Promise<void> {
    if (this.browser !== undefined) await this.browser.close().catch(() => {})
    this.browser = undefined
    this.launching = undefined
  }
}
