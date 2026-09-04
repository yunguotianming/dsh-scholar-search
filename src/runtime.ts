/**
 * The plugin instance runtime shared by the three tools: live config
 * accessors, the source registry, and the resolved download directory.
 * @module dsh-scholar-search/runtime
 */

import type { FetchOptions } from './http.js'
import type { SourceRegistry } from './sources/index.js'

/**
 * The session workspace a tool call resolves against. Matches the shape every
 * dsh tool reads (`exec.agent?.session.header.cwd`); declared locally so the
 * runtime stays free of the agent package's types.
 */
export interface WorkspaceRef {
  agent?: { session: { header: { cwd?: string | undefined } } } | undefined
}

/** Everything a tool closure reads per call. */
export interface Runtime {
  /** Live fetch options (email + per-source timeout). */
  fetchOptions: () => FetchOptions
  /** Enabled search-source ids, read per call (settings hot-reload). */
  enabledSources: () => string[]
  /** The source registry. */
  registry: SourceRegistry
  /** Optional browser downloader for bot-blocked publishers (undefined when disabled or unavailable). */
  browser?: { fetchPdf(url: string, opts: { downloadDir: string; timeoutMs: number; signal?: AbortSignal | undefined }): Promise<{ data: Uint8Array; finalUrl: string } | undefined> } | undefined
  /**
   * Resolve the absolute download directory for one call: `downloadDir`
   * relative to the session workspace (`exec.agent.session.header.cwd`),
   * falling back to the plugin launch cwd when the call has no agent (webhook,
   * scheduled task). Never resolves against the harness install directory.
   */
  resolveDownloadDir: (exec: WorkspaceRef) => string
  /** Per-download PDF timeout in milliseconds. */
  pdfTimeoutMs: number
  /** Cooperative tool-call budget in milliseconds. */
  toolTimeoutMs: number
  /** Default `scholar_read` slice length. */
  readMaxChars: number
}
