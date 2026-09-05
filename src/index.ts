/**
 * dsh-scholar-search: free academic literature search + OA full-text download
 * for DeepSeek Harness. Registers scholar_search / scholar_download /
 * scholar_read on `ctx.tools`, a system-prompt guidance section, a settings
 * section (hot-updatable config), and `GET /scholar-search/ping` on the web
 * server for the settings card's connectivity checks.
 * @module dsh-scholar-search
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { buildSources, SEARCH_SOURCE_IDS } from './sources/index.js'
import type { SourceRegistry } from './sources/index.js'
import { DEFAULT_GRAYAREA_MIRRORS, scihubPingMirror } from './sources/grayarea.js'
import { buildGuidance } from './prompt.js'
import { BrowserDownloader } from './browser.js'
import { applySearchTool } from './tools/search.js'
import { applyDownloadTool, applyScihubDownloadTool } from './tools/download.js'
import { applyReadTool } from './tools/read.js'
import { applyChineseSearchTools } from './tools/chinese-search.js'
import { CnkiMcpManager } from './chinese/cnki-mcp.js'
import { PING_ROUTE, SETTINGS_NAMESPACE } from './shared/constants.js'
import type { PingResponse } from './shared/constants.js'
import type { Runtime } from './runtime.js'

const DEFAULT_CNKI_MCP_PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../vendor/cnki-mcp')

export type { PaperMeta, ScholarSource, SearchQuery } from './types.js'
export { normalizeTitle, paperKeys, mergePapers, mergePaperLists, scorePaper, mergeAndRank, SOURCE_QUALITY } from './paper.js'
export { downloadPaper, buildFallbackChain, pdfCandidatesFor, safeFilename, looksLikePdf, fetchPdfBytes } from './download.js'
export type { DownloadResult, DownloadSuccess, DownloadFailure } from './download.js'
export { extractPdfText, extractPdfFile, sliceText } from './pdf.js'
export { buildGuidance, SCHOLAR_GUIDANCE } from './prompt.js'
export * from './sources/index.js'
export { grayareaSource, pdfUrlFromGrayAreaHtml, DEFAULT_GRAYAREA_MIRRORS, scihubResolvePdf, scihubPingMirror } from './sources/grayarea.js'
export type { MirrorProbe } from './sources/grayarea.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'scholar-search'

/** Services required before `apply` runs; `settings` and `webServer` attach lazily. */
export const inject = ['tools', 'systemPrompt']

/** Version string sent in the `User-Agent`; kept in sync with package.json. */
export const VERSION = '0.2.0'

export { PING_ROUTE, SETTINGS_NAMESPACE } from './shared/constants.js'
export type { PingResponse } from './shared/constants.js'

/** Plugin configuration; every field is optional and hot-updatable from the settings UI. */
export interface Config {
  /** Polite-pool email: required by Unpaywall, sent as `mailto` to OpenAlex/Crossref and in the User-Agent. */
  email?: string
  /** Semantic Scholar API key (without one you share the public rate limit). */
  semanticScholarApiKey?: string
  /** NCBI E-utilities API key (3 req/s without, 10 req/s with). */
  pubmedApiKey?: string
  /** CORE API key (free registration); the CORE source is skipped without it. */
  coreApiKey?: string
  /** SerpAPI key for Google Scholar (paid, free tier 100/month); the source is skipped without it. */
  googleScholarApiKey?: string
  /** Enable gray-area mirrors (Sci-Hub) as the LAST download fallback. Off by default. Legal risk is yours — see README. */
  allowGrayArea?: boolean
  /** Gray-area mirror URL templates with a `{doi}` placeholder; only used when allowGrayArea is true. */
  grayAreaMirrors?: string[]
  /** Directory PDFs download into (relative to the workspace, or absolute). Defaults to `download/papers` under the workspace. */
  downloadDir?: string
  /** Search sources participating in scholar_search. */
  enabledSources?: string[]
  /** Per-source request timeout in milliseconds. */
  sourceTimeoutMs?: number
  /** Per-download PDF timeout in milliseconds. */
  pdfTimeoutMs?: number
  /** Cooperative per-tool-call budget in milliseconds. */
  toolTimeoutMs?: number
  /** Default scholar_read slice length in characters. */
  readMaxChars?: number
  /** Per-source minimum request intervals in milliseconds (overrides the defaults). */
  sourceMinIntervals?: Record<string, number>
  /** Retry bot-blocked publisher downloads through a real browser (Playwright + system Chrome/Edge). */
  browserDownload?: boolean
  /** Explicit browser executable path; absent probes the chrome/msedge channels. */
  browserExecutablePath?: string
  /** Enable Chinese CNKI/Wanfang/CQVIP search support. */
  chineseSearchEnabled?: boolean
  /** Enable lazy automatic startup of the local cnki-mcp HTTP service. */
  cnkiMcpAutoStart?: boolean
  /** cnki-mcp Streamable HTTP endpoint. */
  cnkiMcpEndpoint?: string
  /** Executable used to launch cnki-mcp, normally `uv`. */
  cnkiMcpExecutable?: string
  /** cnki-mcp checkout directory used by automatic startup. */
  cnkiMcpProjectDir?: string
  /** Maximum time to wait for an automatically started cnki-mcp service. */
  cnkiMcpStartupTimeoutMs?: number
  /** Minimum interval between CNKI business calls. */
  cnkiMcpMinIntervalMs?: number
}

export const Config: Schema<Config> = Schema.object({
  email: Schema.string().default('').description('Polite-pool email: required by Unpaywall; sent as mailto to OpenAlex/Crossref and in the User-Agent.'),
  semanticScholarApiKey: Schema.string().role('secret').default('').description('Semantic Scholar API key (optional; without one you share the public rate limit).'),
  pubmedApiKey: Schema.string().role('secret').default('').description('NCBI E-utilities API key (optional; 3 req/s without, 10 req/s with).'),
  coreApiKey: Schema.string().role('secret').default('').description('CORE API key (optional, free registration at core.ac.uk); the CORE source is skipped without it.'),
  googleScholarApiKey: Schema.string().role('secret').default('').description('SerpAPI key for Google Scholar (optional, paid with free tier 100/month); the source is skipped without it.'),
  allowGrayArea: Schema.boolean().default(false).description('Enable gray-area mirrors (Sci-Hub) as the LAST download fallback. May be illegal in your jurisdiction — you bear the risk.'),
  grayAreaMirrors: Schema.array(Schema.string()).default([...DEFAULT_GRAYAREA_MIRRORS]).description('Gray-area mirror URL templates ({doi} placeholder); only used when allowGrayArea is true.'),
  downloadDir: Schema.string().default('download/papers').description('Directory PDFs download into (relative to the workspace, or absolute).'),
  enabledSources: Schema.array(Schema.string()).default([...SEARCH_SOURCE_IDS]).description(`Search sources participating in scholar_search: ${SEARCH_SOURCE_IDS.join(', ')}.`),
  sourceTimeoutMs: Schema.number().default(15_000).description('Per-source request timeout (ms).'),
  pdfTimeoutMs: Schema.number().default(60_000).description('Per-download PDF timeout (ms).'),
  toolTimeoutMs: Schema.number().default(30_000).description('Cooperative per-tool-call budget (ms).'),
  readMaxChars: Schema.number().default(8_000).description('Default scholar_read slice length (characters).'),
  sourceMinIntervals: Schema.dict(Schema.number()).default({}).description('Per-source minimum request interval (ms), overriding the polite-rate defaults.'),
  browserDownload: Schema.boolean().default(false).description('Retry bot-blocked publisher downloads through a real browser (Playwright + system Chrome/Edge). Off by default.'),
  browserExecutablePath: Schema.string().default('').description('Explicit browser executable path (optional); absent probes the chrome/msedge channels.'),
  chineseSearchEnabled: Schema.boolean().default(true).description('Enable Chinese paper search on CNKI, Wanfang, and CQVIP.'),
  cnkiMcpAutoStart: Schema.boolean().default(true).description('Start cnki-mcp automatically when CNKI search is first used.'),
  cnkiMcpEndpoint: Schema.string().default('http://127.0.0.1:7788/mcp').description('cnki-mcp Streamable HTTP endpoint.'),
  cnkiMcpExecutable: Schema.string().default('uv').description('Executable used to start cnki-mcp.'),
  cnkiMcpProjectDir: Schema.string().default(DEFAULT_CNKI_MCP_PROJECT_DIR).description('cnki-mcp project directory for automatic startup.'),
  cnkiMcpStartupTimeoutMs: Schema.number().default(30_000).description('Startup wait budget for cnki-mcp in milliseconds.'),
  cnkiMcpMinIntervalMs: Schema.number().default(3_000).description('Minimum interval between CNKI business calls; protects the account from burst traffic.'),
})

/** Complete config after schemastery applies every default. */
type ResolvedConfig = Required<Config>

/** Blank-string helper: the schema defaults secrets to '' so absent means "not set". */
function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** The lightweight endpoint each source is pinged at. */
const PING_ENDPOINTS: Record<string, string> = {
  openalex: 'https://api.openalex.org/works?search=test&per-page=1',
  semantic_scholar: 'https://api.semanticscholar.org/graph/v1/paper/search?query=test&limit=1&fields=title',
  pubmed: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=test&retmax=1&retmode=json',
  europe_pmc: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=test&format=json&pageSize=1',
  arxiv: 'https://export.arxiv.org/api/query?search_query=all:test&max_results=1',
  biorxiv: 'https://api.biorxiv.org/details/biorxiv/2024-01-01/2024-01-01/0',
  crossref: 'https://api.crossref.org/works?query=test&rows=1',
  doaj: 'https://doaj.org/api/v2/search/articles/test?pageSize=1',
  core: 'https://api.core.ac.uk/v3/search/works?q=test&limit=1',
  google_scholar: 'https://serpapi.com/search?engine=google_scholar&q=test&num=1',
  unpaywall: 'https://api.unpaywall.org/v2/10.1038/nature12373',
  openaire: 'https://api.openaire.eu/search/publications?doi=10.1038/nature12373&format=json&size=1',
}

/**
 * Validate the config, build the runtime, and register the tools, the prompt
 * section, the settings section, and the ping route. Every registration is an
 * effect on `ctx`, so disposing the plugin fiber unregisters everything.
 * @param ctx - plugin context with `tools` and `systemPrompt` ready.
 * @param config - schemastery-validated config with defaults applied.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  for (const field of ['sourceTimeoutMs', 'pdfTimeoutMs', 'toolTimeoutMs', 'readMaxChars'] as const) {
    const value = resolved[field]
    if (!Number.isInteger(value) || value < 1) throw new Error(`scholar-search: ${field} must be a positive integer`)
  }
  if (!Number.isInteger(resolved.cnkiMcpStartupTimeoutMs) || resolved.cnkiMcpStartupTimeoutMs < 1) {
    throw new Error('scholar-search: cnkiMcpStartupTimeoutMs must be a positive integer')
  }
  if (!Number.isInteger(resolved.cnkiMcpMinIntervalMs) || resolved.cnkiMcpMinIntervalMs < 1_000) {
    throw new Error('scholar-search: cnkiMcpMinIntervalMs must be an integer of at least 1000 ms')
  }
  try {
    const endpoint = new URL(resolved.cnkiMcpEndpoint)
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') throw new Error('unsupported protocol')
  } catch {
    throw new Error('scholar-search: cnkiMcpEndpoint must be an http(s) URL')
  }

  // Live config source: the settings section swaps it on hot reload.
  let current: () => ResolvedConfig = () => resolved

  const cnkiMcp = new CnkiMcpManager(() => ({
    enabled: current().chineseSearchEnabled,
    autoStart: current().cnkiMcpAutoStart,
    endpoint: current().cnkiMcpEndpoint,
    executable: current().cnkiMcpExecutable,
    projectDir: current().cnkiMcpProjectDir,
    startupTimeoutMs: current().cnkiMcpStartupTimeoutMs,
    minIntervalMs: current().cnkiMcpMinIntervalMs,
  }))
  ctx.effect(() => () => { void cnkiMcp.close() }, 'scholar-search: close cnki-mcp')

  const fetchOptions = () => ({
    timeoutMs: current().sourceTimeoutMs,
    email: nonEmpty(current().email),
  })
  const registry: SourceRegistry = buildSources({
    fetchOptions,
    semanticScholarApiKey: () => nonEmpty(current().semanticScholarApiKey),
    pubmedApiKey: () => nonEmpty(current().pubmedApiKey),
    coreApiKey: () => nonEmpty(current().coreApiKey),
    googleScholarApiKey: () => nonEmpty(current().googleScholarApiKey),
    allowGrayArea: () => current().allowGrayArea,
    grayAreaMirrors: () => current().grayAreaMirrors.length > 0 ? current().grayAreaMirrors : [...DEFAULT_GRAYAREA_MIRRORS],
    sourceMinIntervals: () => current().sourceMinIntervals,
  })
  // Browser downloader is created lazily only when enabled, and closed on dispose.
  const browser = resolved.browserDownload
    ? new BrowserDownloader({ executablePath: nonEmpty(resolved.browserExecutablePath) })
    : undefined
  if (browser !== undefined) {
    ctx.effect(() => () => { void browser.close() }, 'scholar-search: close browser')
  }
  const runtime: Runtime = {
    fetchOptions,
    enabledSources: () => current().enabledSources,
    registry,
    browser: browser !== undefined && browser.available ? browser : undefined,
    // Resolve per call: downloadDir relative to the session workspace cwd, not
    // the harness launch directory. An absolute downloadDir wins outright; a
    // call with no agent falls back to the plugin launch cwd.
    resolveDownloadDir: (exec) => {
      const configured = current().downloadDir
      const base = exec.agent?.session.header.cwd ?? process.cwd()
      return resolve(base, configured)
    },
    pdfTimeoutMs: resolved.pdfTimeoutMs,
    toolTimeoutMs: resolved.toolTimeoutMs,
    readMaxChars: resolved.readMaxChars,
    cnkiMcp,
    chineseSearchEnabled: () => current().chineseSearchEnabled,
  }

  applySearchTool(ctx, runtime)
  applyDownloadTool(ctx, runtime)
  applyScihubDownloadTool(ctx, runtime, () => current().allowGrayArea, () => current().grayAreaMirrors)
  applyReadTool(ctx, runtime)
  applyChineseSearchTools(ctx, runtime)

  const guidance = buildGuidance()
  ctx.systemPrompt.section({ name: guidance.name, order: 150, text: guidance.text })

  // Settings section: hot-updatable config + the namespace the Web card pairs
  // on. The published dsh-settings API surface (rc.6) exposes register(), not
  // the repository's newer installSection() — register a namespace scoped to
  // this plugin and swap the live config source on every change. The branded
  // `SettingsNamespace` is a compile-time-only marker; a plain string assertion
  // satisfies it (the runtime export `settingsNamespace` is absent from rc.6's
  // lib, so a value import would fail at load).
  ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(SETTINGS_NAMESPACE as SettingsNamespace, Config, { base: config })
    current = () => scope.get() as ResolvedConfig
    scope.watch((next) => {
      current = () => next as ResolvedConfig
    })
  })

  // Ping route for the settings card's per-source connectivity checks. The
  // webServer service exists only in the web composition; headless skips this.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.webServer.register({
      kind: 'exact',
      path: PING_ROUTE,
      handler: async (req, res) => {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'GET' })
          res.end(JSON.stringify({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'GET only' }))
          return
        }
        const url = new URL(req.url ?? PING_ROUTE, 'http://localhost')
        const sourceId = url.searchParams.get('source') ?? ''
        // Sci-Hub mirrors are pinged individually by template host.
        if (sourceId === 'scihub') {
          const mirrors = current().grayAreaMirrors.length > 0 ? current().grayAreaMirrors : [...DEFAULT_GRAYAREA_MIRRORS]
          const results: Array<{ host: string; ok: boolean; latencyMs?: number; error?: string }> = []
          for (const template of mirrors) {
            const result = await scihubPingMirror(template, { timeoutMs: 10_000, signal: AbortSignal.timeout(10_000) })
            results.push(result)
          }
          const anyOk = results.some((r) => r.ok)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify({ ok: anyOk, source: 'scihub', mirrors: results }))
          return
        }
        const endpoint = PING_ENDPOINTS[sourceId]
        let body: PingResponse
        if (endpoint === undefined) {
          body = { ok: false, source: sourceId, error: `unknown source "${sourceId}"` }
        } else {
          const started = Date.now()
          try {
            const opts = fetchOptions()
            const headers: Record<string, string> = { 'User-Agent': 'dsh-scholar-search/' + VERSION }
            if (opts.email !== undefined) headers['User-Agent'] += `; mailto:${opts.email}`
            // Unpaywall requires ?email= as a query param, not just a header.
            let finalEndpoint = endpoint
            if (sourceId === 'unpaywall' && opts.email !== undefined && opts.email.length > 0) {
              finalEndpoint = `${endpoint}?email=${encodeURIComponent(opts.email)}`
            }
            const controller = new AbortController()
            req.once('close', () => { controller.abort() })
            const response = await fetch(finalEndpoint, {
              headers,
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
            })
            body = response.ok
              ? { ok: true, source: sourceId, latencyMs: Date.now() - started }
              : { ok: false, source: sourceId, error: `HTTP ${response.status}` }
          } catch (error) {
            body = { ok: false, source: sourceId, error: error instanceof Error ? error.message : String(error) }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(body))
      },
    })
  })
}

export { CnkiMcpManager } from './chinese/cnki-mcp.js'
export { ChineseBrowserWorkflow, isDetailUrl, parseSnapshot, providerFromUrl, resolveHref } from './chinese/browser-workflow.js'
export { applyChineseSearchTools } from './tools/chinese-search.js'
