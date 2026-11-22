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
export interface BatchDownloadResult {
    results: {
        paper: PaperMeta;
        download: DownloadResult;
    }[];
    summary: {
        requested: number;
        unique: number;
        downloaded: number;
        failed: number;
        skipped: number;
    };
}
export declare const DOWNLOAD_OUTPUT_SCHEMA: {
    readonly properties: {
        readonly results: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly paper: {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly title: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly authors: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly year: {
                                readonly type: "integer";
                            };
                            readonly printYear: {
                                readonly type: "integer";
                            };
                            readonly onlineYear: {
                                readonly type: "integer";
                            };
                            readonly volume: {
                                readonly type: "string";
                            };
                            readonly issue: {
                                readonly type: "string";
                            };
                            readonly pages: {
                                readonly type: "string";
                            };
                            readonly articleNumber: {
                                readonly type: "string";
                            };
                            readonly venue: {
                                readonly type: "string";
                            };
                            readonly abstract: {
                                readonly type: "string";
                            };
                            readonly keywords: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly doi: {
                                readonly type: "string";
                            };
                            readonly arxivId: {
                                readonly type: "string";
                            };
                            readonly pmid: {
                                readonly type: "string";
                            };
                            readonly pmcid: {
                                readonly type: "string";
                            };
                            readonly citationCount: {
                                readonly type: "integer";
                            };
                            readonly isOpenAccess: {
                                readonly type: "boolean";
                            };
                            readonly openAccessPdfUrl: {
                                readonly type: "string";
                            };
                            readonly landingPageUrl: {
                                readonly type: "string";
                            };
                            readonly siteDownloadUrl: {
                                readonly type: "string";
                            };
                            readonly publishDate: {
                                readonly type: "string";
                            };
                            readonly onlinePublishDate: {
                                readonly type: "string";
                            };
                            readonly organizations: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly funds: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly classifications: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly source: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly sourceId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly oaSources: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                        };
                    };
                    readonly download: {
                        readonly required: true;
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
                                readonly description: "no-free-fulltext, write-error, file-exists, timeout, not-attempted, metadata-mismatch, metadata-unverified, content-mismatch.";
                            };
                            readonly failureKind: {
                                readonly type: "string";
                                readonly description: "no-candidate, candidates-failed, or lookup-failed.";
                            };
                            readonly message: {
                                readonly type: "string";
                            };
                            readonly metadata: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly title: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly authors: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly year: {
                                        readonly type: "integer";
                                    };
                                    readonly printYear: {
                                        readonly type: "integer";
                                    };
                                    readonly onlineYear: {
                                        readonly type: "integer";
                                    };
                                    readonly volume: {
                                        readonly type: "string";
                                    };
                                    readonly issue: {
                                        readonly type: "string";
                                    };
                                    readonly pages: {
                                        readonly type: "string";
                                    };
                                    readonly articleNumber: {
                                        readonly type: "string";
                                    };
                                    readonly venue: {
                                        readonly type: "string";
                                    };
                                    readonly abstract: {
                                        readonly type: "string";
                                    };
                                    readonly keywords: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly doi: {
                                        readonly type: "string";
                                    };
                                    readonly arxivId: {
                                        readonly type: "string";
                                    };
                                    readonly pmid: {
                                        readonly type: "string";
                                    };
                                    readonly pmcid: {
                                        readonly type: "string";
                                    };
                                    readonly citationCount: {
                                        readonly type: "integer";
                                    };
                                    readonly isOpenAccess: {
                                        readonly type: "boolean";
                                    };
                                    readonly openAccessPdfUrl: {
                                        readonly type: "string";
                                    };
                                    readonly landingPageUrl: {
                                        readonly type: "string";
                                    };
                                    readonly siteDownloadUrl: {
                                        readonly type: "string";
                                    };
                                    readonly publishDate: {
                                        readonly type: "string";
                                    };
                                    readonly onlinePublishDate: {
                                        readonly type: "string";
                                    };
                                    readonly organizations: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly funds: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly classifications: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly source: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly sourceId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly oaSources: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                            };
                            readonly pdfVerification: {
                                readonly type: "string";
                                readonly enum: readonly ["matched", "unverified"];
                                readonly description: "PDF 首页身份核验结果。";
                            };
                            readonly manualLinks: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                                readonly description: "人工补齐可打开的全文候选和文章页。";
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
                            readonly attempts: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly source: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly url: {
                                            readonly type: "string";
                                        };
                                        readonly reason: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly status: {
                                            readonly type: "integer";
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly summary: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly requested: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly unique: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly downloaded: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly failed: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly skipped: {
                    readonly type: "integer";
                    readonly required: true;
                };
            };
        };
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
            readonly description: "no-free-fulltext, write-error, file-exists, timeout, not-attempted, metadata-mismatch, metadata-unverified, content-mismatch.";
        };
        readonly failureKind: {
            readonly type: "string";
            readonly description: "no-candidate, candidates-failed, or lookup-failed.";
        };
        readonly message: {
            readonly type: "string";
        };
        readonly metadata: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly title: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly authors: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly year: {
                    readonly type: "integer";
                };
                readonly printYear: {
                    readonly type: "integer";
                };
                readonly onlineYear: {
                    readonly type: "integer";
                };
                readonly volume: {
                    readonly type: "string";
                };
                readonly issue: {
                    readonly type: "string";
                };
                readonly pages: {
                    readonly type: "string";
                };
                readonly articleNumber: {
                    readonly type: "string";
                };
                readonly venue: {
                    readonly type: "string";
                };
                readonly abstract: {
                    readonly type: "string";
                };
                readonly keywords: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly doi: {
                    readonly type: "string";
                };
                readonly arxivId: {
                    readonly type: "string";
                };
                readonly pmid: {
                    readonly type: "string";
                };
                readonly pmcid: {
                    readonly type: "string";
                };
                readonly citationCount: {
                    readonly type: "integer";
                };
                readonly isOpenAccess: {
                    readonly type: "boolean";
                };
                readonly openAccessPdfUrl: {
                    readonly type: "string";
                };
                readonly landingPageUrl: {
                    readonly type: "string";
                };
                readonly siteDownloadUrl: {
                    readonly type: "string";
                };
                readonly publishDate: {
                    readonly type: "string";
                };
                readonly onlinePublishDate: {
                    readonly type: "string";
                };
                readonly organizations: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly funds: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly classifications: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly source: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly sourceId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly oaSources: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
            };
        };
        readonly pdfVerification: {
            readonly type: "string";
            readonly enum: readonly ["matched", "unverified"];
            readonly description: "PDF 首页身份核验结果。";
        };
        readonly manualLinks: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
            readonly description: "人工补齐可打开的全文候选和文章页。";
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
        readonly attempts: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly source: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly url: {
                        readonly type: "string";
                    };
                    readonly reason: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly status: {
                        readonly type: "integer";
                    };
                };
            };
        };
    };
    readonly type: "object";
    readonly additionalProperties: false;
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
            readonly description: "镜像未取得 PDF 时为 scihub-not-found；保存失败时为 write-error 或 file-exists。";
        };
        readonly message: {
            readonly type: "string";
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
export { paperFromIdentifier } from '../paper.js';
export declare function renderDownload(value: DownloadResult | BatchDownloadResult): {
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
    error: 'scihub-not-found' | 'write-error' | 'file-exists';
    message?: string;
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
 * @param grayAreaMirrors - live config accessor.
 */
export declare function applyScihubDownloadTool(ctx: Context, runtime: Runtime, grayAreaMirrors: () => string[]): void;
