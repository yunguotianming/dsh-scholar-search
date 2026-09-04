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
  venue?: string
  abstract?: string
  doi?: string
  arxivId?: string
  pmid?: string
  pmcid?: string
  citationCount?: number
  isOpenAccess?: boolean
  openAccessPdfUrl?: string
  landingPageUrl?: string
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
}
