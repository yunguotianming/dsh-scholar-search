/**
 * The settings card's state and actions, framework-neutral so it is testable
 * without React. Reads the resolved config through the bound `settingsScope`
 * snapshot and pings each source through the Node half's
 * `GET /scholar-search/ping?source=` route.
 * @module dsh-scholar-search/client/controller
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
import type { PingResponse } from '../shared/constants.js';
/** Sources the card can ping (search sources + the two always-on link sources + Sci-Hub). */
export declare const PINGABLE_SOURCES: readonly ["openalex", "semantic_scholar", "pubmed", "europe_pmc", "arxiv", "biorxiv", "crossref", "doaj", "core", "google_scholar", "unpaywall", "openaire", "scihub"];
/** Connectivity state of one source. */
export type SourceCheck = {
    status: 'idle';
} | {
    status: 'checking';
} | {
    status: 'ok';
    latencyMs: number;
} | {
    status: 'error';
    message: string;
};
/** What the card renders. */
export interface ScholarCardState {
    /** Whether the first scope snapshot arrived. */
    loaded: boolean;
    /** Config summary fields projected from the scope value. */
    emailConfigured: boolean;
    downloadDir: string;
    enabledSources: string[];
    allowGrayArea: boolean;
    /** Per-source connectivity, keyed by source id. */
    checks: Record<string, SourceCheck>;
    /** A test-all run is in flight. */
    busy: boolean;
    /** Set when the ping route itself is unreachable. */
    routeError?: string;
    /** Whether the scope supports writes (set/unset present). */
    editable: boolean;
    /** In-flight edits, keyed by field name. */
    draft: Record<string, string>;
    /** Per-field save-in-flight flag. */
    saving: Record<string, boolean>;
    /** Per-field save notice ('saved' or an error message), cleared on the next edit. */
    notices: Record<string, {
        kind: 'saved';
    } | {
        kind: 'error';
        message: string;
    }>;
    /** Which fields are currently configured (secret fields only track presence, never the value). */
    configured: Record<string, boolean>;
    /** Current resolved values of non-secret fields (email, downloadDir), for placeholder display. */
    resolvedValues: Record<string, string>;
}
/** Minimal snapshot store the slot renderer can bind as a selector hook. */
export interface CardStore<T> extends HostObservable<T> {
    set(next: T): void;
}
/**
 * Create a plain snapshot store (getSnapshot/subscribe/set). Kept local so the
 * bundle depends on no store engine beyond the platform modules.
 * @param initial - the first snapshot.
 * @returns the store.
 */
export declare function createCardStore<T>(initial: T): CardStore<T>;
/** Ping response for Sci-Hub: carries per-mirror detail. */
export interface ScihubPingResponse extends PingResponse {
    mirrors?: Array<{
        host: string;
        ok: boolean;
        latencyMs?: number;
        error?: string;
    }>;
}
/** Same-origin ping of the Node half's route; injectable for tests. */
export type PingFetch = (source: string, signal?: AbortSignal) => Promise<PingResponse>;
/** Default ping fetcher: `GET /scholar-search/ping?source=` on the page origin. */
export declare const fetchPing: PingFetch;
/** The subset of a bound settings scope this card reads and writes. */
export interface ScopeLike {
    /** Subscribe to scope changes; returns an unsubscribe. */
    subscribe(fn: () => void): () => void;
    /** The current resolved value snapshot. */
    getSnapshot(): {
        value?: Record<string, unknown> | undefined;
    };
    /** Write one field (dsh settingsScope.set); absent when the scope is read-only. */
    set?(field: string, value: unknown): Promise<void>;
    /** Clear one field (dsh settingsScope.unset); absent when the scope is read-only. */
    unset?(field: string): Promise<void>;
}
/** Bridges the settings scope and the ping route onto the card snapshot. */
export declare class ScholarCardController {
    private readonly scope;
    private readonly ping;
    /** The card snapshot the renderer binds. */
    readonly store: CardStore<ScholarCardState>;
    private generation;
    /**
     * @param scope - the bound settings scope for the `scholar-search` namespace.
     * @param ping - ping fetcher (defaults to same-origin `fetch`).
     */
    constructor(scope: ScopeLike, ping?: PingFetch);
    private get state();
    private patch;
    /** Re-project the config summary from the current scope snapshot. */
    private projectFromScope;
    /** Stage one field's edit text; clears any prior notice for that field. */
    editField(field: string, text: string): void;
    /** Whether the field has a staged draft differing from the resolved value. */
    isDirty(field: string): boolean;
    /**
     * Persist one field through the scope. Reads the staged draft for text
     * fields; `explicit` lets a checkbox save its boolean directly.
     * @param field - config field name.
     * @param explicit - a value to write instead of the draft (checkboxes).
     */
    saveField(field: string, explicit?: unknown): Promise<void>;
    /** Clear one stored field through the scope (secrets the user wants gone). */
    clearField(field: string): Promise<void>;
    /**
     * Ping one source and record the outcome. For `scihub` the response carries
     * per-mirror results; the summary message lists the reachable mirrors.
     * @param source - the source id.
     */
    testSource(source: string): Promise<void>;
    /** Ping every source in parallel and record every outcome. */
    testAll(): Promise<void>;
}
