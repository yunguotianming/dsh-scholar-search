/**
 * Dedup, merge, and quality-weighted ranking for multi-source results.
 * Key design and weights follow QwenPaw local_paper_hub's
 * `search_pipeline/dedupe.py` and `ranker.py`, translated to TypeScript.
 * @module dsh-scholar-search/paper
 */
import type { PaperMeta } from './types.js';
/** 把 DOI、arXiv ID 或 PMID 转为来源解析器使用的最小题录。 */
export declare function paperFromIdentifier(identifier: string): PaperMeta;
/** Source quality weights (local_paper_hub `SOURCE_QUALITY`). */
export declare const SOURCE_QUALITY: Record<string, number>;
/**
 * Title normalization for the last-resort dedupe key: lowercase, strip
 * punctuation, KEEP CJK characters, collapse whitespace.
 * @param title - raw title.
 * @returns the normalized key fragment.
 */
export declare function normalizeTitle(title: string): string;
/**
 * Dedupe keys of one paper, strongest first:
 * `doi:` → `arxiv:` → `pmid:` → `url:` → `title:`.
 * @param paper - normalized record.
 * @returns the keys this record answers to, first-seen order.
 */
export declare function paperKeys(paper: PaperMeta): string[];
/** Quality weight of a source id. */
export declare function sourceQuality(source: string): number;
/**
 * Merge two records of the same paper: `base` keeps its identity (source,
 * sourceId, key order), fields fill in from `incoming` when absent or shorter.
 * @param base - the record already in the merged map.
 * @param incoming - the duplicate being folded in.
 * @returns a new merged record.
 */
export declare function mergePapers(base: PaperMeta, incoming: PaperMeta): PaperMeta;
/**
 * Merge a multi-source result list into one deduped list. Records answering
 * to the same key fold together; the surviving record keeps the strongest
 * source's identity and accumulates `oaSources`.
 * @param papers - raw hits from every source.
 * @returns the deduped list, first-occurrence order.
 */
export declare function mergePaperLists(papers: PaperMeta[]): PaperMeta[];
/**
 * Score one merged paper: source quality, recency (papers from the last 5
 * years get a bonus fading with age), and an OA bonus so downloadable hits
 * float up. Within-source rank is preserved by the caller via a small
 * position term.
 * @param paper - merged record.
 * @param rankInSource - 0-based rank the paper's source returned it at.
 * @param listSize - size of that source's list (for rank normalization).
 * @param nowYear - current year (injectable for tests).
 * @returns the composite score, higher is better.
 */
export declare function scorePaper(paper: PaperMeta, rankInSource: number, listSize: number, nowYear: number): number;
/**
 * Merge and rank the fan-out results of every source. Each original record is
 * scored with its own rank inside its source's list; a merged paper keeps the
 * best score among its duplicates.
 * @param results - per-source lists, each tagged with its source id implicitly via the records.
 * @param limit - cap on the returned list.
 * @param nowYear - current year (injectable for tests).
 * @returns the deduped, ranked list.
 */
export declare function mergeAndRank(results: PaperMeta[][], limit: number, nowYear: number): PaperMeta[];
