/**
 * `scholar_search` — federated free-literature search: fan out to the enabled
 * sources in parallel, dedupe + merge + quality-rank, return PaperMeta[].
 * @module dsh-scholar-search/tools/search
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenericCallView } from '@deepseek-ai/dsh-tools';
import type { Runtime } from '../runtime.js';
import type { SearchValue } from '../search.js';
export { compactPaper } from '../search.js';
export type { SearchValue } from '../search.js';
/** Output schema of one paper in the result list. */
export declare const PAPER_META_SCHEMA: {
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
/** Output schema of `scholar_search`. */
export declare const SEARCH_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly query: {
            readonly type: "string";
            readonly required: true;
        };
        readonly total: {
            readonly type: "integer";
            readonly required: true;
            readonly description: "Papers returned after dedupe and ranking.";
        };
        readonly papers: {
            readonly type: "array";
            readonly required: true;
            readonly items: {
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
        };
        readonly searchedSources: {
            readonly type: "array";
            readonly required: true;
            readonly items: {
                readonly type: "string";
            };
        };
        readonly failedSources: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
            readonly description: "Sources that errored and were skipped.";
        };
    };
};
/** Model-facing rendering: one line per paper, identifiers and OA status visible. */
export declare function renderSearch(value: SearchValue): {
    type: 'text';
    text: string;
}[];
/** Pending-call card. */
export declare function presentSearchCall(query: string): GenericCallView;
/**
 * Register `scholar_search`.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param runtime - plugin runtime.
 */
export declare function applySearchTool(ctx: Context, runtime: Runtime): void;
