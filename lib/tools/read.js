/**
 * `scholar_read` — extract the text of a PDF: either a file already on disk
 * (a previous scholar_download path) or an identifier to fetch first.
 * @module dsh-scholar-search/tools/read
 */
import { stat } from 'node:fs/promises';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { downloadPaper } from '../download.js';
import { extractPdfFile, sliceText } from '../pdf.js';
import { PAPER_META_SCHEMA } from './search.js';
import { paperFromIdentifier, renderDownload } from './download.js';
/** Output schema of `scholar_read`. */
export const READ_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        path: { type: 'string', required: true, description: 'Absolute path of the PDF that was read.' },
        pages: { type: 'integer', required: true },
        totalChars: { type: 'integer', required: true, description: 'Length of the whole extracted text.' },
        text: { type: 'string', required: true, description: 'The returned slice of extracted text.' },
        truncated: { type: 'boolean', required: true, description: 'True when text remains after this slice.' },
    },
};
/** Model-facing rendering of a read result. */
export function renderRead(value) {
    const head = `Full text of ${value.path} — ${value.pages} page(s), ${value.totalChars.toLocaleString('en-US')} characters${value.truncated ? ` (showing the first ${value.text.length.toLocaleString('en-US')}; call again with a larger maxChars for more)` : ' (complete)'}.`;
    return [{ type: 'text', text: `${head}\n\n${value.text}` }];
}
/** Pending-call card. */
export function presentReadCall(label) {
    return { card: 'generic', title: `Scholar read: ${label}`, kind: 'read', rawInput: label };
}
/**
 * Register `scholar_read`.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param runtime - plugin runtime.
 */
export function applyReadTool(ctx, runtime) {
    ctx.tools.register(defineTool({
        name: 'scholar_read',
        description: 'Extract the text of a paper PDF. Pass path (a file saved by scholar_download) or identifier (DOI/arxivId/PMID — downloaded first through the OA fallback chain). Returns up to maxChars of extracted text.',
        parameters: {
            path: { type: 'string', description: 'Absolute path of an already-downloaded PDF.' },
            identifier: { type: 'string', description: 'DOI, arXiv id, or PMID to download then read.' },
            paper: { ...PAPER_META_SCHEMA, description: 'A paper object as returned by scholar_search; downloaded then read.' },
            maxChars: { type: 'integer', description: `Characters to return (default ${runtime.readMaxChars}).` },
            downloadDir: { type: 'string', description: '需先下载时使用的本次目标目录，相对会话工作区或绝对路径。' },
        },
        output: {
            schema: READ_OUTPUT_SCHEMA,
            render: (_args, value) => renderRead(value),
        },
        timeoutMs: runtime.toolTimeoutMs + runtime.pdfTimeoutMs,
        isConcurrencySafe: () => true,
        presentCall: (args) => presentReadCall(args.path ?? args.identifier ?? args.paper?.title ?? 'paper'),
        async execute(args, exec) {
            let path;
            if (args.path !== undefined && args.path.trim().length > 0) {
                path = args.path.trim();
                const info = await stat(path).catch(() => undefined);
                if (info === undefined || !info.isFile())
                    throw new Error(`"${path}" is not a file on disk; pass an identifier to download first`);
            }
            else {
                const paper = args.paper !== undefined
                    ? args.paper
                    : args.identifier !== undefined
                        ? paperFromIdentifier(args.identifier)
                        : (() => { throw new Error('provide path, identifier, or paper'); })();
                const downloaded = await downloadPaper(paper, {
                    registry: runtime.registry,
                    downloadDir: runtime.resolveDownloadDir(exec, args.downloadDir),
                    fetchOptions: runtime.fetchOptions,
                    pdfTimeoutMs: runtime.pdfTimeoutMs,
                    browser: runtime.browser,
                }, exec.signal);
                if ('error' in downloaded)
                    throw new Error(renderDownload(downloaded)[0].text);
                path = downloaded.path;
            }
            const { text, pages } = await extractPdfFile(path);
            if (text.trim().length === 0)
                throw new Error('the PDF downloaded but no readable text could be extracted (scanned or image-only PDF)');
            const maxChars = Math.max(1, Math.trunc(args.maxChars ?? runtime.readMaxChars));
            const slice = sliceText(text, maxChars);
            return { path, pages, totalChars: slice.totalChars, text: slice.text, truncated: slice.truncated };
        },
    }));
}
