/**
 * `scholar_download` — resolve a paper's free full text through the fallback
 * chain and save the PDF to `downloadDir`.
 * `scholar_scihub_download` — direct Sci-Hub download, bypassing the OA chain.
 * @module dsh-scholar-search/tools/download
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { downloadPaper, fetchPdfBytesDetailed, safeFilename, looksLikePdf } from '../download.js';
import { normalizeArxivId, normalizeDoi, normalizePmid, isHttpUrl, requestSignal } from '../http.js';
import { PAPER_META_SCHEMA } from './search.js';
import { scihubResolvePdf, DEFAULT_GRAYAREA_MIRRORS } from '../sources/grayarea.js';
/** Output schema of `scholar_download`. */
export const DOWNLOAD_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        path: { type: 'string', description: 'Absolute path of the saved PDF.' },
        source: { type: 'string', description: 'Fallback level that produced the PDF.' },
        url: { type: 'string', description: 'Final URL the PDF was fetched from.' },
        sizeBytes: { type: 'integer' },
        error: { type: 'string', description: `'no-free-fulltext' when every level failed.` },
        triedSources: { type: 'array', items: { type: 'string' } },
        failures: { type: 'array', items: { type: 'string' }, description: 'One level:host entry per fetched-but-rejected candidate.' },
    },
};
/** Output schema of `scholar_scihub_download`. */
export const SCIHUB_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        path: { type: 'string', description: 'Absolute path of the saved PDF.' },
        url: { type: 'string', description: 'Final URL the PDF was fetched from.' },
        sizeBytes: { type: 'integer' },
        mirror: { type: 'string', description: 'The Sci-Hub mirror that provided the PDF.' },
        error: { type: 'string', description: `'scihub-not-found' when no mirror has it, 'scihub-disabled' when allowGrayArea is off.` },
        probes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { host: { type: 'string' }, status: { type: 'string' }, latencyMs: { type: 'number' } } }, description: 'Per-mirror diagnostics.' },
    },
};
/**
 * Turn a model-supplied identifier into a minimal {@link PaperMeta} the chain
 * can work on. Throws when the identifier matches nothing we know.
 * @param identifier - DOI, arXiv id, or PMID.
 * @returns the seed paper.
 */
export function paperFromIdentifier(identifier) {
    const trimmed = identifier.trim();
    if (trimmed.length === 0)
        throw new Error('identifier must be a non-empty string');
    const doi = normalizeDoi(trimmed);
    if (doi !== undefined) {
        return { title: doi, doi, source: 'identifier', sourceId: doi, landingPageUrl: `https://doi.org/${doi}` };
    }
    const arxivId = normalizeArxivId(trimmed);
    if (arxivId !== undefined) {
        return {
            title: `arXiv:${arxivId}`,
            arxivId,
            source: 'arxiv',
            sourceId: arxivId,
            isOpenAccess: true,
            openAccessPdfUrl: `https://arxiv.org/pdf/${arxivId}`,
            landingPageUrl: `https://arxiv.org/abs/${arxivId}`,
        };
    }
    const pmid = normalizePmid(trimmed);
    if (pmid !== undefined && /^\d+$/.test(trimmed)) {
        return { title: `PMID ${pmid}`, pmid, source: 'pubmed', sourceId: pmid, landingPageUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` };
    }
    throw new Error(`"${identifier}" is not a recognized identifier (expected a DOI, arXiv id, or PMID); pass a paper object from scholar_search instead`);
}
/** Model-facing rendering of a download result. */
export function renderDownload(value) {
    if ('error' in value) {
        const tried = value.triedSources.join(' → ') || 'none';
        const failed = value.failures !== undefined && value.failures.length > 0 ? `\nRejected candidates: ${value.failures.join(', ')}` : '';
        return [{ type: 'text', text: `No free full text found (tried: ${tried}).${failed} The paper may be paywalled; the chain never bypasses access controls.` }];
    }
    return [{ type: 'text', text: `Downloaded PDF (${(value.sizeBytes / 1024).toFixed(0)} KiB) via ${value.source}.\nSaved to: ${value.path}\nFetched from: ${value.url}\nUse scholar_read with this path to extract the text.` }];
}
/** Model-facing rendering of a Sci-Hub download result. */
export function renderScihubDownload(value) {
    if ('error' in value) {
        if (value.error === 'scihub-disabled') {
            return [{ type: 'text', text: 'Sci-Hub download is disabled. Enable "allowGrayArea" in Settings → Plugins → Scholar Search.' }];
        }
        const probeSummary = value.probes.map((p) => `${p.host}: ${p.status}`).join(', ');
        return [{ type: 'text', text: `Sci-Hub could not find this paper (probed: ${probeSummary}). The DOI may be missing from Sci-Hub's database, or all mirrors are unreachable.` }];
    }
    return [{ type: 'text', text: `Downloaded PDF (${(value.sizeBytes / 1024).toFixed(0)} KiB) via Sci-Hub mirror ${value.mirror}.\nSaved to: ${value.path}\nFetched from: ${value.url}\nUse scholar_read with this path to extract the text.` }];
}
/** Pending-call card. */
export function presentDownloadCall(label) {
    return { card: 'generic', title: `Scholar download: ${label}`, kind: 'read', rawInput: label };
}
/** Pending-call card for Sci-Hub. */
export function presentScihubDownloadCall(label) {
    return { card: 'generic', title: `Sci-Hub download: ${label}`, kind: 'read', rawInput: label };
}
/**
 * Register `scholar_download`.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param runtime - plugin runtime.
 */
export function applyDownloadTool(ctx, runtime) {
    ctx.tools.register(defineTool({
        name: 'scholar_download',
        description: 'Download a paper\'s free full-text PDF through an open-access fallback chain (OpenAlex → Unpaywall → Semantic Scholar → Europe PMC → arXiv/bioRxiv → OpenAIRE → CORE → publisher page → OA patterns). Saves to the configured download directory. Never bypasses a paywall; reports no-free-fulltext when no legal free copy exists.',
        parameters: {
            identifier: { type: 'string', description: 'DOI, arXiv id, or PMID. Mutually exclusive with paper.' },
            paper: { ...PAPER_META_SCHEMA, description: 'A paper object as returned by scholar_search. Mutually exclusive with identifier.' },
            filename: { type: 'string', description: 'Override the output filename (a .pdf suffix is added when missing).' },
        },
        output: {
            schema: DOWNLOAD_OUTPUT_SCHEMA,
            render: (_args, value) => renderDownload(value),
        },
        timeoutMs: runtime.toolTimeoutMs + runtime.pdfTimeoutMs,
        isConcurrencySafe: () => true,
        presentCall: (args) => presentDownloadCall(args.identifier ?? args.paper?.title ?? 'paper'),
        async execute(args, exec) {
            let paper;
            if (args.paper !== undefined) {
                if (typeof args.paper !== 'object' || args.paper === null || typeof args.paper.title !== 'string') {
                    throw new Error('paper must be a paper object as returned by scholar_search');
                }
                paper = args.paper;
            }
            else if (args.identifier !== undefined) {
                paper = paperFromIdentifier(args.identifier);
            }
            else {
                throw new Error('provide either identifier (DOI/arxivId/PMID) or a paper object');
            }
            const result = await downloadPaper(paper, {
                registry: runtime.registry,
                downloadDir: runtime.resolveDownloadDir(exec),
                fetchOptions: runtime.fetchOptions,
                pdfTimeoutMs: runtime.pdfTimeoutMs,
                filename: args.filename,
                browser: runtime.browser,
            }, exec.signal);
            return result;
        },
    }));
}
/**
 * Register `scholar_scihub_download`.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param runtime - plugin runtime.
 * @param allowGrayArea - live config accessor.
 * @param grayAreaMirrors - live config accessor.
 */
export function applyScihubDownloadTool(ctx, runtime, allowGrayArea, grayAreaMirrors) {
    ctx.tools.register(defineTool({
        name: 'scholar_scihub_download',
        description: 'Download a paper directly through Sci-Hub mirrors. Requires allowGrayArea to be enabled in settings. This bypasses the legal open-access chain — use only when you understand the legal risk in your jurisdiction.',
        parameters: {
            doi: { type: 'string', description: 'The DOI of the paper to download (e.g. "10.1038/nature12373").' },
            filename: { type: 'string', description: 'Override the output filename (a .pdf suffix is added when missing).' },
        },
        output: {
            schema: SCIHUB_OUTPUT_SCHEMA,
            render: (_args, value) => renderScihubDownload(value),
        },
        timeoutMs: runtime.toolTimeoutMs + runtime.pdfTimeoutMs,
        isConcurrencySafe: () => true,
        presentCall: (args) => presentScihubDownloadCall(args.doi ?? 'unknown'),
        async execute(args, exec) {
            if (!allowGrayArea()) {
                return { error: 'scihub-disabled', probes: [] };
            }
            if (args.doi === undefined) {
                throw new Error('doi is required');
            }
            const doi = normalizeDoi(args.doi);
            if (doi === undefined) {
                throw new Error(`"${args.doi}" is not a valid DOI`);
            }
            const mirrors = grayAreaMirrors().length > 0 ? grayAreaMirrors() : [...DEFAULT_GRAYAREA_MIRRORS];
            const opts = runtime.fetchOptions();
            const { pdfUrl, probes } = await scihubResolvePdf(doi, mirrors, { ...opts, signal: exec.signal });
            if (pdfUrl === undefined) {
                return {
                    error: 'scihub-not-found',
                    probes: probes.map((p) => ({ host: p.host, status: p.status, latencyMs: p.latencyMs })),
                };
            }
            // Download the PDF bytes from the resolved mirror URL.
            const downloadDir = runtime.resolveDownloadDir(exec);
            const detailed = await fetchPdfBytesDetailed(pdfUrl, { timeoutMs: runtime.pdfTimeoutMs, signal: exec.signal });
            if (detailed.fetch === undefined) {
                return {
                    error: 'scihub-not-found',
                    probes: [...probes.map((p) => ({ host: p.host, status: p.status, latencyMs: p.latencyMs })), { host: new URL(pdfUrl).hostname, status: detailed.failure?.reason ?? 'network', latencyMs: 0 }],
                };
            }
            await mkdir(downloadDir, { recursive: true });
            const paper = { title: doi, doi, source: 'scihub', sourceId: doi };
            const filename = safeFilename(paper, args.filename);
            const path = join(downloadDir, filename);
            await writeFile(path, detailed.fetch.data);
            const mirrorHost = new URL(pdfUrl).hostname;
            return {
                path: resolve(path),
                url: detailed.fetch.finalUrl,
                sizeBytes: detailed.fetch.data.length,
                mirror: mirrorHost,
            };
        },
    }));
}
