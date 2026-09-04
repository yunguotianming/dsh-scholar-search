/**
 * The settings card's state and actions, framework-neutral so it is testable
 * without React. Reads the resolved config through the bound `settingsScope`
 * snapshot and pings each source through the Node half's
 * `GET /scholar-search/ping?source=` route.
 * @module dsh-scholar-search/client/controller
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PingResponse } from '../shared/constants.js'
import { PING_ROUTE } from '../shared/constants.js'

/** Sources the card can ping (search sources + the two always-on link sources + Sci-Hub). */
export const PINGABLE_SOURCES = [
  'openalex',
  'semantic_scholar',
  'pubmed',
  'europe_pmc',
  'arxiv',
  'biorxiv',
  'crossref',
  'doaj',
  'core',
  'google_scholar',
  'unpaywall',
  'openaire',
  'scihub',
] as const

/** Connectivity state of one source. */
export type SourceCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; latencyMs: number }
  | { status: 'error'; message: string }

/** What the card renders. */
export interface ScholarCardState {
  /** Whether the first scope snapshot arrived. */
  loaded: boolean
  /** Config summary fields projected from the scope value. */
  emailConfigured: boolean
  downloadDir: string
  enabledSources: string[]
  allowGrayArea: boolean
  /** Per-source connectivity, keyed by source id. */
  checks: Record<string, SourceCheck>
  /** A test-all run is in flight. */
  busy: boolean
  /** Set when the ping route itself is unreachable. */
  routeError?: string
  /** Whether the scope supports writes (set/unset present). */
  editable: boolean
  /** In-flight edits, keyed by field name. */
  draft: Record<string, string>
  /** Per-field save-in-flight flag. */
  saving: Record<string, boolean>
  /** Per-field save notice ('saved' or an error message), cleared on the next edit. */
  notices: Record<string, { kind: 'saved' } | { kind: 'error'; message: string }>
  /** Which fields are currently configured (secret fields only track presence, never the value). */
  configured: Record<string, boolean>
  /** Current resolved values of non-secret fields (email, downloadDir), for placeholder display. */
  resolvedValues: Record<string, string>
}

/** A partial update; an explicit `undefined` deletes that optional member. */
type CardPatch = { [K in keyof ScholarCardState]?: ScholarCardState[K] | undefined }

/** Minimal snapshot store the slot renderer can bind as a selector hook. */
export interface CardStore<T> extends HostObservable<T> {
  set(next: T): void
}

/**
 * Create a plain snapshot store (getSnapshot/subscribe/set). Kept local so the
 * bundle depends on no store engine beyond the platform modules.
 * @param initial - the first snapshot.
 * @returns the store.
 */
export function createCardStore<T>(initial: T): CardStore<T> {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    set(next) {
      if (Object.is(next, snapshot)) return
      snapshot = next
      for (const fn of [...listeners]) fn()
    },
  }
}

/** Ping response for Sci-Hub: carries per-mirror detail. */
export interface ScihubPingResponse extends PingResponse {
  mirrors?: Array<{ host: string; ok: boolean; latencyMs?: number; error?: string }>
}

/** Same-origin ping of the Node half's route; injectable for tests. */
export type PingFetch = (source: string, signal?: AbortSignal) => Promise<PingResponse>

/** Default ping fetcher: `GET /scholar-search/ping?source=` on the page origin. */
export const fetchPing: PingFetch = async (source, signal) => {
  const res = await fetch(`${PING_ROUTE}?source=${encodeURIComponent(source)}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    ...(signal !== undefined ? { signal } : {}),
  })
  if (!res.ok) {
    return { ok: false, source, error: res.status === 404 ? 'ping route not available (headless or an older plugin build)' : `HTTP ${res.status}` }
  }
  return await res.json() as PingResponse
}

/** The subset of a bound settings scope this card reads and writes. */
export interface ScopeLike {
  /** Subscribe to scope changes; returns an unsubscribe. */
  subscribe(fn: () => void): () => void
  /** The current resolved value snapshot. */
  getSnapshot(): { value?: Record<string, unknown> | undefined }
  /** Write one field (dsh settingsScope.set); absent when the scope is read-only. */
  set?(field: string, value: unknown): Promise<void>
  /** Clear one field (dsh settingsScope.unset); absent when the scope is read-only. */
  unset?(field: string): Promise<void>
}

function configString(value: Record<string, unknown> | undefined, key: string): string {
  const raw = value?.[key]
  return typeof raw === 'string' ? raw : ''
}

function configStringList(value: Record<string, unknown> | undefined, key: string): string[] {
  const raw = value?.[key]
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
}

/** Bridges the settings scope and the ping route onto the card snapshot. */
export class ScholarCardController {
  /** The card snapshot the renderer binds. */
  readonly store: CardStore<ScholarCardState>
  private generation = 0

  /**
   * @param scope - the bound settings scope for the `scholar-search` namespace.
   * @param ping - ping fetcher (defaults to same-origin `fetch`).
   */
  constructor(private readonly scope: ScopeLike, private readonly ping: PingFetch = fetchPing) {
    this.store = createCardStore<ScholarCardState>({
      loaded: false,
      emailConfigured: false,
      downloadDir: 'download/papers',
      enabledSources: [],
      allowGrayArea: false,
      checks: {},
      busy: false,
      editable: typeof scope.set === 'function',
      draft: {},
      saving: {},
      notices: {},
      configured: {},
      resolvedValues: {},
    })
    this.scope.subscribe(() => { this.projectFromScope() })
    this.projectFromScope()
  }

  private get state(): ScholarCardState {
    return this.store.getSnapshot()
  }

  private patch(changes: CardPatch): void {
    const next = { ...this.state } as Record<string, unknown>
    for (const [key, value] of Object.entries(changes)) {
      // An explicit undefined removes the optional member (`exactOptionalPropertyTypes`).
      if (value === undefined) delete next[key]
      else next[key] = value
    }
    this.store.set(next as unknown as ScholarCardState)
  }

  /** Re-project the config summary from the current scope snapshot. */
  private projectFromScope(): void {
    const value = this.scope.getSnapshot().value
    const configured: Record<string, boolean> = {}
    const resolvedValues: Record<string, string> = {}
    // Track which fields have a non-empty resolved value. Secret fields only
    // record presence; text fields also expose the value for the placeholder.
    for (const field of ['email', 'semanticScholarApiKey', 'pubmedApiKey', 'coreApiKey', 'googleScholarApiKey', 'downloadDir']) {
      const raw = configString(value, field)
      configured[field] = raw.trim().length > 0
      if (field === 'email' || field === 'downloadDir') resolvedValues[field] = raw
    }
    this.patch({
      loaded: true,
      emailConfigured: configString(value, 'email').trim().length > 0,
      downloadDir: configString(value, 'downloadDir') || 'download/papers',
      enabledSources: configStringList(value, 'enabledSources'),
      allowGrayArea: value?.allowGrayArea === true,
      configured,
      resolvedValues,
    })
  }

  /** Stage one field's edit text; clears any prior notice for that field. */
  editField(field: string, text: string): void {
    const notices = { ...this.state.notices }
    delete notices[field]
    this.patch({ draft: { ...this.state.draft, [field]: text }, notices })
  }

  /** Whether the field has a staged draft differing from the resolved value. */
  isDirty(field: string): boolean {
    const draft = this.state.draft[field]
    return draft !== undefined && draft.trim().length > 0
  }

  /**
   * Persist one field through the scope. Reads the staged draft for text
   * fields; `explicit` lets a checkbox save its boolean directly.
   * @param field - config field name.
   * @param explicit - a value to write instead of the draft (checkboxes).
   */
  async saveField(field: string, explicit?: unknown): Promise<void> {
    if (this.scope.set === undefined || this.state.saving[field] === true) return
    const value = explicit !== undefined ? explicit : this.state.draft[field]?.trim()
    if (explicit === undefined && (typeof value !== 'string' || value.length === 0)) return
    this.patch({ saving: { ...this.state.saving, [field]: true } })
    try {
      await this.scope.set(field, value)
      const draft = { ...this.state.draft }
      delete draft[field]
      this.patch({
        saving: { ...this.state.saving, [field]: false },
        draft,
        notices: { ...this.state.notices, [field]: { kind: 'saved' } },
      })
    } catch (error) {
      this.patch({
        saving: { ...this.state.saving, [field]: false },
        notices: { ...this.state.notices, [field]: { kind: 'error', message: error instanceof Error ? error.message : String(error) } },
      })
    }
  }

  /** Clear one stored field through the scope (secrets the user wants gone). */
  async clearField(field: string): Promise<void> {
    if (this.scope.unset === undefined || this.state.saving[field] === true) return
    this.patch({ saving: { ...this.state.saving, [field]: true } })
    try {
      await this.scope.unset(field)
      this.patch({
        saving: { ...this.state.saving, [field]: false },
        notices: { ...this.state.notices, [field]: { kind: 'saved' } },
      })
    } catch (error) {
      this.patch({
        saving: { ...this.state.saving, [field]: false },
        notices: { ...this.state.notices, [field]: { kind: 'error', message: error instanceof Error ? error.message : String(error) } },
      })
    }
  }

  /**
   * Ping one source and record the outcome. For `scihub` the response carries
   * per-mirror results; the summary message lists the reachable mirrors.
   * @param source - the source id.
   */
  async testSource(source: string): Promise<void> {
    const generation = this.generation
    this.patch({ checks: { ...this.state.checks, [source]: { status: 'checking' } } })
    let check: SourceCheck
    try {
      const answer = await this.ping(source) as ScihubPingResponse
      if (source === 'scihub' && answer.mirrors !== undefined) {
        const reachable = answer.mirrors.filter((m) => m.ok)
        check = answer.ok
          ? { status: 'ok', latencyMs: Math.min(...reachable.map((m) => m.latencyMs ?? 0)) }
          : { status: 'error', message: `all ${answer.mirrors.length} mirrors unreachable` }
      } else {
        check = answer.ok
          ? { status: 'ok', latencyMs: answer.latencyMs ?? 0 }
          : { status: 'error', message: answer.error ?? 'unknown error' }
      }
    } catch (error) {
      check = { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    if (generation !== this.generation) return
    this.patch({ checks: { ...this.store.getSnapshot().checks, [source]: check } })
  }

  /** Ping every source in parallel and record every outcome. */
  async testAll(): Promise<void> {
    const generation = ++this.generation
    this.patch({ busy: true, routeError: undefined })
    await Promise.allSettled(PINGABLE_SOURCES.map((source) => this.testSource(source)))
    if (generation !== this.generation) return
    const checks = this.store.getSnapshot().checks
    const routeDown = PINGABLE_SOURCES.every((source) => {
      const check = checks[source]
      return check?.status === 'error' && /ping route not available/.test(check.message)
    })
    this.patch({ busy: false, ...(routeDown ? { routeError: 'unavailable' } : {}) })
  }
}
