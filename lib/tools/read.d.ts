/**
 * `scholar_read` — extract the text of a PDF: either a file already on disk
 * (a previous scholar_download path) or an identifier to fetch first.
 * @module dsh-scholar-search/tools/read
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenericCallView } from '@deepseek-ai/dsh-tools';
import type { Runtime } from '../runtime.js';
/** Output schema of `scholar_read`. */
export declare const READ_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly path: {
            readonly type: "string";
            readonly required: true;
            readonly description: "Absolute path of the PDF that was read.";
        };
        readonly pages: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly totalChars: {
            readonly type: "integer";
            readonly required: true;
            readonly description: "Length of the whole extracted text.";
        };
        readonly text: {
            readonly type: "string";
            readonly required: true;
            readonly description: "The returned slice of extracted text.";
        };
        readonly truncated: {
            readonly type: "boolean";
            readonly required: true;
            readonly description: "True when text remains after this slice.";
        };
    };
};
/** Canonical value of `scholar_read`. */
export interface ReadValue {
    path: string;
    pages: number;
    totalChars: number;
    text: string;
    truncated: boolean;
}
/** Model-facing rendering of a read result. */
export declare function renderRead(value: ReadValue): {
    type: 'text';
    text: string;
}[];
/** Pending-call card. */
export declare function presentReadCall(label: string): GenericCallView;
/**
 * Register `scholar_read`.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param runtime - plugin runtime.
 */
export declare function applyReadTool(ctx: Context, runtime: Runtime): void;
