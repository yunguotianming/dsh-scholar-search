/**
 * `scholar_download` — resolve a paper's free full text through the fallback
 * chain and save the PDF to `downloadDir`.
 * `scholar_scihub_download` — direct Sci-Hub download, bypassing the OA chain.
 * @module dsh-scholar-search/tools/download
 */
import { join, resolve } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { downloadPaper, fetchPdfBytesDetailed, paperLandingLinks, safeFilename, prepareDownloadDir, savePdf } from '../download.js';
import { mergePaperLists, paperFromIdentifier } from '../paper.js';
import { normalizeDoi } from '../http.js';
import { PAPER_META_SCHEMA } from './search.js';
import { scihubResolvePdf, DEFAULT_GRAYAREA_MIRRORS } from '../sources/grayarea.js';
/** Output schema of `scholar_download`. */
const DOWNLOAD_ITEM_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        path: { type: 'string', description: 'Absolute path of the saved PDF.' },
        source: { type: 'string', description: 'Fallback level that produced the PDF.' },
        url: { type: 'string', description: 'Final URL the PDF was fetched from.' },
        sizeBytes: { type: 'integer' },
        error: { type: 'string', description: 'no-free-fulltext, write-error, file-exists, timeout, not-attempted, metadata-mismatch, metadata-unverified, content-mismatch.' },
        failureKind: { type: 'string', description: 'no-candidate, candidates-failed, or lookup-failed.' },
        message: { type: 'string' },
        metadata: PAPER_META_SCHEMA,
        pdfVerification: { type: 'string', enum: ['matched', 'unverified'], description: 'PDF 首页身份核验结果。' },
        manualLinks: { type: 'array', items: { type: 'string' }, description: '人工补齐可打开的全文候选和文章页。' },
        triedSources: { type: 'array', items: { type: 'string' } },
        failures: { type: 'array', items: { type: 'string' }, description: 'One level:host entry per fetched-but-rejected candidate.' },
        attempts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
                    source: { type: 'string', required: true }, url: { type: 'string' }, reason: { type: 'string', required: true }, status: { type: 'integer' },
                } } },
    },
};
export const DOWNLOAD_OUTPUT_SCHEMA = {
    ...DOWNLOAD_ITEM_SCHEMA,
    properties: {
        ...DOWNLOAD_ITEM_SCHEMA.properties,
        results: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
                    paper: { ...PAPER_META_SCHEMA, required: true }, download: { ...DOWNLOAD_ITEM_SCHEMA, required: true },
                } } },
        summary: { type: 'object', additionalProperties: false, properties: {
                requested: { type: 'integer', required: true }, unique: { type: 'integer', required: true },
                downloaded: { type: 'integer', required: true }, failed: { type: 'integer', required: true },
                skipped: { type: 'integer', required: true },
            } },
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
        error: { type: 'string', description: '镜像未取得 PDF 时为 scihub-not-found；保存失败时为 write-error 或 file-exists。' },
        message: { type: 'string' },
        probes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { host: { type: 'string' }, status: { type: 'string' }, latencyMs: { type: 'number' } } }, description: 'Per-mirror diagnostics.' },
    },
};
export { paperFromIdentifier } from '../paper.js';
/** Model-facing rendering of a download result. */
function downloadStatus(value) {
    if (value.error !== 'no-free-fulltext')
        return value.error;
    const reasons = new Set(value.attempts?.map((attempt) => attempt.reason));
    const causes = [...reasons].filter((reason) => reason !== 'lookup-failed');
    return causes.length > 0 ? causes.join('、') : value.failureKind ?? value.error;
}
export function renderDownload(value) {
    if ('summary' in value) {
        const counts = value.summary;
        const saved = [];
        const pending = [];
        for (const { paper, download } of value.results) {
            if ('path' in download) {
                saved.push(`- ${download.path}${download.pdfVerification === 'unverified' ? '（PDF 待核验）' : ''}`);
                continue;
            }
            const doi = normalizeDoi(paper.doi);
            const links = download.error === 'metadata-mismatch' ? [] : (download.manualLinks ?? paperLandingLinks(paper)).slice(0, 2);
            pending.push(`- ${paper.title}${doi === undefined ? '' : `（DOI ${doi}）`} [${downloadStatus(download)}]${links.length > 0 ? ' ' + links.join(' · ') : ''}`);
        }
        const summary = `批量下载：输入 ${counts.requested} 条，去重后 ${counts.unique} 条，已下载 ${counts.downloaded} 条，失败 ${counts.failed} 条，未尝试 ${counts.skipped} 条。`;
        return [{ type: 'text', text: [summary, ...(saved.length > 0 ? ['已保存', ...saved] : []), ...(pending.length > 0 ? ['待补齐', ...pending] : [])].join('\n') }];
    }
    if ('error' in value) {
        const tried = value.triedSources.join(' → ') || 'none';
        const diagnostics = value.attempts?.map((attempt) => `${attempt.source}:${attempt.url ?? '解析'}(${attempt.reason})`) ?? value.failures ?? [];
        const failed = diagnostics.length > 0 ? `\n失败记录：${diagnostics.join(', ')}` : '';
        const manual = value.manualLinks?.length ? `\n人工补齐链接：\n${value.manualLinks.join('\n')}` : '';
        const statusMessage = value.error === 'content-mismatch'
            ? '候选 PDF 的题名或 DOI 与目标文献冲突，已跳过该文件。'
            : value.failureKind === 'candidates-failed' ? '已找到候选链接，本次未取得可用 PDF。' : '本次未定位到可用 PDF。';
        return [{ type: 'text', text: `${value.message ?? statusMessage}\n状态：${downloadStatus(value)}。已尝试：${tried}。${failed}${manual}` }];
    }
    const metadata = value.metadata;
    const verified = metadata === undefined ? '' : `\n已核对注册元数据：${metadata.title}；作者：${metadata.authors?.join('; ') ?? '未提供'}；DOI：${metadata.doi}；著录年：${metadata.year ?? '未提供'}；期刊：${metadata.venue ?? '未提供'}；卷期页码/文章号：${[metadata.volume, metadata.issue, metadata.pages, metadata.articleNumber].filter((item) => item !== undefined).join(' · ') || '未提供'}。`;
    const pdfCheck = value.pdfVerification === 'matched' ? '\nPDF 首页身份已匹配。' : '\nPDF 身份待人工核验。';
    return [{ type: 'text', text: `已下载 PDF（${(value.sizeBytes / 1024).toFixed(0)} KiB），来源：${value.source}。\n保存路径：${value.path}\n最终 URL：${value.url}${pdfCheck}${verified}\n使用 scholar_read 提取并核对正文。` }];
}
/** Model-facing rendering of a Sci-Hub download result. */
export function renderScihubDownload(value) {
    if ('error' in value) {
        if (value.message !== undefined)
            return [{ type: 'text', text: value.message }];
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
        description: '通过 OA 回退链尝试各开放副本，保存前核对 PDF 首页身份。支持单篇和批量下载、自选目录、去重计数和失败项人工补齐链接。',
        parameters: {
            identifier: { type: 'string', description: 'DOI, arXiv id, or PMID. Mutually exclusive with paper.' },
            paper: { ...PAPER_META_SCHEMA, description: 'A paper object as returned by scholar_search. Mutually exclusive with identifier.' },
            papers: { type: 'array', items: PAPER_META_SCHEMA, description: '批量下载的文献对象，最多 50 条；与 identifier、paper、filename 互斥。' },
            filename: { type: 'string', description: '单篇自定义文件名，保留中文；补全 .pdf 并清理非法路径字符。' },
            downloadDir: { type: 'string', description: '本次目标目录：绝对路径或相对会话工作区路径；不修改插件默认目录。' },
            verifyMetadata: { type: 'boolean', description: '下载前精确回解 DOI 并核对 paper 标题；不匹配或未核实则停止该篇。适用于旧清单及正式著录核查，默认 false；仅 identifier 时只能核实 DOI 记录，无法核对预期文章。' },
        },
        output: {
            schema: DOWNLOAD_OUTPUT_SCHEMA,
            render: (_args, value) => renderDownload(value),
        },
        timeoutMs: runtime.toolTimeoutMs + runtime.pdfTimeoutMs,
        isConcurrencySafe: () => true,
        presentCall: (args) => presentDownloadCall(args.identifier ?? args.paper?.title ?? 'paper'),
        async execute(args, exec) {
            if ([args.identifier, args.paper, args.papers].filter((value) => value !== undefined).length !== 1) {
                throw new Error('identifier、paper、papers 必须且只能提供一项');
            }
            if (args.papers !== undefined) {
                if (args.filename !== undefined)
                    throw new Error('批量下载不能使用同一个 filename');
                if (args.papers.length === 0 || args.papers.length > 50)
                    throw new Error('papers 必须包含 1–50 条文献');
                const papers = mergePaperLists(args.papers);
                const results = [];
                // 在工具总预算前结束，保留已完成结果；外部取消仍原样传播。
                const budget = AbortSignal.timeout(Math.max(1, runtime.toolTimeoutMs + runtime.pdfTimeoutMs - 1000));
                const signal = AbortSignal.any([exec.signal, budget]);
                for (const paper of papers) {
                    let download;
                    try {
                        download = await downloadPaper(paper, {
                            registry: runtime.registry, downloadDir: runtime.resolveDownloadDir(exec, args.downloadDir),
                            fetchOptions: runtime.fetchOptions, pdfTimeoutMs: runtime.pdfTimeoutMs, browser: runtime.browser,
                            verifyMetadata: args.verifyMetadata,
                        }, signal);
                    }
                    catch (error) {
                        exec.signal.throwIfAborted();
                        if (!budget.aborted)
                            throw error;
                        download = { error: 'timeout', triedSources: [], message: '本批次时间预算已用尽，保留已完成条目。' };
                    }
                    results.push({ paper, download });
                    if (budget.aborted || ('error' in download && download.error === 'write-error'))
                        break;
                }
                const skipped = papers.length - results.length;
                for (const paper of papers.slice(results.length))
                    results.push({ paper, download: { error: 'not-attempted', triedSources: [], message: '批次因目录故障或时间预算停止，本条未尝试。' } });
                const downloaded = results.filter((item) => !('error' in item.download)).length;
                return { results, summary: { requested: args.papers.length, unique: papers.length, downloaded, failed: results.length - downloaded - skipped, skipped } };
            }
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
                downloadDir: runtime.resolveDownloadDir(exec, args.downloadDir),
                fetchOptions: runtime.fetchOptions,
                pdfTimeoutMs: runtime.pdfTimeoutMs,
                filename: args.filename,
                verifyMetadata: args.verifyMetadata,
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
 * @param grayAreaMirrors - live config accessor.
 */
export function applyScihubDownloadTool(ctx, runtime, grayAreaMirrors) {
    ctx.tools.register(defineTool({
        name: 'scholar_scihub_download',
        description: '直接通过 Sci-Hub 镜像下载论文，默认可用，无需启用开关。此工具直接查询镜像；普通下载请用 scholar_download 按 OA 优先的顺序尝试。',
        parameters: {
            doi: { type: 'string', description: 'The DOI of the paper to download (e.g. "10.1038/nature12373").' },
            filename: { type: 'string', description: 'Override the output filename (a .pdf suffix is added when missing).' },
            downloadDir: { type: 'string', description: '本次目标目录，相对会话工作区或绝对路径。' },
        },
        output: {
            schema: SCIHUB_OUTPUT_SCHEMA,
            render: (_args, value) => renderScihubDownload(value),
        },
        timeoutMs: runtime.toolTimeoutMs + runtime.pdfTimeoutMs,
        isConcurrencySafe: () => true,
        presentCall: (args) => presentScihubDownloadCall(args.doi ?? 'unknown'),
        async execute(args, exec) {
            if (args.doi === undefined) {
                throw new Error('doi is required');
            }
            const doi = normalizeDoi(args.doi);
            if (doi === undefined) {
                throw new Error(`"${args.doi}" is not a valid DOI`);
            }
            const downloadDir = runtime.resolveDownloadDir(exec, args.downloadDir);
            try {
                await prepareDownloadDir(downloadDir);
            }
            catch (error) {
                return { error: 'write-error', message: `目标目录无法写入：${error instanceof Error ? error.message : String(error)}`, probes: [] };
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
            const detailed = await fetchPdfBytesDetailed(pdfUrl, { timeoutMs: runtime.pdfTimeoutMs, signal: exec.signal });
            if (detailed.fetch === undefined) {
                return {
                    error: 'scihub-not-found',
                    probes: [...probes.map((p) => ({ host: p.host, status: p.status, latencyMs: p.latencyMs })), { host: new URL(pdfUrl).hostname, status: detailed.failure?.reason ?? 'network', latencyMs: 0 }],
                };
            }
            const paper = { title: doi, doi, source: 'scihub', sourceId: doi };
            const filename = safeFilename(paper, args.filename);
            const path = join(downloadDir, filename);
            try {
                await savePdf(path, detailed.fetch.data);
            }
            catch (error) {
                return { error: error.code === 'EEXIST' ? 'file-exists' : 'write-error', message: `PDF 未保存：${error instanceof Error ? error.message : String(error)}`, probes: [] };
            }
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
