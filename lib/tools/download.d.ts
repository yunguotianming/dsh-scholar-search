/**
 * `scholar_download` — resolve a paper's free full text through the fallback
 * chain and save the PDF to `downloadDir`.
 * `scholar_scihub_download` — direct Sci-Hub download, bypassing the OA chain.
 * @module dsh-scholar-search/tools/download
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenericCallView } from '@deepseek-ai/dsh-tools';
import type { DownloadResult } from '../download.js';
import type { Runtime } from '../runtime.js';
import type { PaperMeta } from '../types.js';
/** Output schema of `scholar_download`. */
export declare const DOWNLOAD_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly path: {
            readonly type: "string";
            readonly description: "Absolute path of the saved PDF.";
        };
        readonly source: {
            readonly type: "string";
            readonly description: "Fallback level that produced the PDF.";
        };
        readonly url: {
            readonly type: "string";
            readonly description: "Final URL the PDF was fetched from.";
        };
        readonly sizeBytes: {
            readonly type: "integer";
        };
        readonly error: {
            readonly type: "string";
            readonly description: "'no-free-fulltext' when every level failed.";
        };
        readonly triedSources: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly failures: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
            readonly description: "One level:host entry per fetched-but-rejected candidate.";
        };
    };
};
/** Output schema of `scholar_scihub_download`. */
export declare const SCIHUB_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly path: {
            readonly type: "string";
            readonly description: "Absolute path of the saved PDF.";
        };
        readonly url: {
            readonly type: "string";
            readonly description: "Final URL the PDF was fetched from.";
        };
        readonly sizeBytes: {
            readonly type: "integer";
        };
        readonly mirror: {
            readonly type: "string";
            readonly description: "The Sci-Hub mirror that provided the PDF.";
        };
        readonly error: {
            readonly type: "string";
            readonly description: "'scihub-not-found' when no mirror has it, 'scihub-disabled' when allowGrayArea is off.";
        };
        readonly probes: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly host: {
                        readonly type: "string";
                    };
                    readonly status: {
                        readonly type: "string";
                    };
                    readonly latencyMs: {
                        readonly type: "number";
                    };
                };
            };
            readonly description: "Per-mirror diagnostics.";
        };
    };
};
/**
 * Turn a model-supplied identifier into a minimal {@link PaperMeta} the chain
 * can work on. Throws when the identifier matches nothing we know.
 * @param identifier - DOI, arXiv id, or PMID.
 * @returns the seed paper.
 */
export declare function paperFromIdentifier(identifier: string): PaperMeta;
/** Model-facing rendering of a download result. */
export declare function renderDownload(value: DownloadResult): {
    type: 'text';
    text: string;
}[];
/** Model-facing rendering of a Sci-Hub download result. */
export declare function renderScihubDownload(value: ScihubDownloadResult): {
    type: 'text';
    text: string;
}[];
/** Pending-call card. */
export declare function presentDownloadCall(label: string): GenericCallView;
/** Pending-call card for Sci-Hub. */
export declare function presentScihubDownloadCall(label: string): GenericCallView;
/** A successful Sci-Hub download. */
export interface ScihubDownloadSuccess {
    path: string;
    url: string;
    sizeBytes: number;
    mirror: string;
}
/** A failed Sci-Hub download. */
export interface ScihubDownloadFailure {
    error: 'scihub-not-found' | 'scihub-disabled';
    probes: Array<{
        host: string;
        status: string;
        latencyMs: number;
    }>;
}
export type ScihubDownloadResult = ScihubDownloadSuccess | ScihubDownloadFailure;
/**
 * Register `scholar_download`.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param runtime - plugin runtime.
 */
export declare function applyDownloadTool(ctx: Context, runtime: Runtime): void;
/**
 * Register `scholar_scihub_download`.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param runtime - plugin runtime.
 * @param allowGrayArea - live config accessor.
 * @param grayAreaMirrors - live config accessor.
 */
export declare function applyScihubDownloadTool(ctx: Context, runtime: Runtime, allowGrayArea: () => boolean, grayAreaMirrors: () => string[]): void;
