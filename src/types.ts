/**
 * The normalized paper model every source maps onto, plus the source
 * interface. Types only — no runtime code.
 * @module dsh-scholar-search/types
 */

/** Normalized literature metadata (all sources unify onto this model). */
export interface PaperMeta {
  title: string
  authors?: string[]
  year?: number
  /** 分别保留卷期年和在线年；著录时优先卷期年。 */
  printYear?: number
  onlineYear?: number
  volume?: string
  issue?: string
  pages?: string
  articleNumber?: string
  venue?: string
  abstract?: string
  keywords?: string[]
  doi?: string
  arxivId?: string
  pmid?: string
  pmcid?: string
  citationCount?: number
  isOpenAccess?: boolean
  openAccessPdfUrl?: string
  landingPageUrl?: string
  /**
   * 站点自身的全文下载入口（CNKI/万方/维普详情页）。它指向用户本人在该站点的
   * 访问权限，插件只解析和转交，不在插件进程里代替用户抓取。
   */
  siteDownloadUrl?: string
  /** 发表日期（中文库详情页“文献发表日期”）。 */
  publishDate?: string
  /** 在线发表日期（中文库详情页“在线出版日期”）。 */
  onlinePublishDate?: string
  /** 机构（中文库详情页字段）。 */
  organizations?: string[]
  /** 资助基金（中文库详情页字段）。 */
  funds?: string[]
  /** 分类号（中文库详情页字段）。 */
  classifications?: string[]
  /** Which source provided this record (e.g. `openalex`). */
  source: string
  /** The id inside that source. */
  sourceId: string
  /** Every source that surfaced this paper after merging. */
  oaSources?: string[]
}

/** A search request fanned out to the enabled sources. */
export interface SearchQuery {
  query: string
  limit?: number
  yearFrom?: number
  yearTo?: number
}

/** 来源提供的 PDF 直链和开放落地页，均按尝试顺序排列。 */
export interface PdfLocations {
  pdfUrls: string[]
  landingUrls: string[]
}

/** Unified source interface. */
export interface ScholarSource {
  readonly id: string
  /**
   * Search the source. A failing source degrades to an empty list (with a
   * warning recorded by the caller) — it never breaks the fan-out.
   */
  search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]>
  /** Resolve a free PDF URL for the paper (optional; link-enrichment sources). */
  resolvePdf?(paper: PaperMeta, signal: AbortSignal): Promise<string | undefined>
  resolvePdfLocations?(paper: PaperMeta, signal: AbortSignal): Promise<PdfLocations>
}
