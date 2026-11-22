/** Copy for the settings card, in the two locales the dsh web client ships. */
/** Dictionary namespace owned by this plugin's browser half. */
export declare const NS = "scholar-search";
/** Copy keys of the card. */
export type ScholarSearchLocaleKey = 'title' | 'description' | 'expand' | 'collapse' | 'configSummary' | 'emailSet' | 'emailUnset' | 'downloadDirLabel' | 'sourcesLabel' | 'grayAreaOn' | 'connectivity' | 'testAll' | 'testing' | 'reachable' | 'unreachable' | 'pingUnavailable' | 'source_openalex' | 'source_semantic_scholar' | 'source_pubmed' | 'source_europe_pmc' | 'source_arxiv' | 'source_biorxiv' | 'source_crossref' | 'source_doaj' | 'source_core' | 'source_google_scholar' | 'source_unpaywall' | 'source_openaire' | 'source_scihub' | 'editConfig' | 'fieldEmail' | 'fieldS2Key' | 'fieldPubmedKey' | 'fieldCoreKey' | 'fieldGoogleScholarKey' | 'fieldDownloadDir' | 'save' | 'clear' | 'saved' | 'saveFailed';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The Scholar Search settings card. */
        'scholar-search': ScholarSearchLocaleKey;
    }
}
export declare const en: Record<ScholarSearchLocaleKey, string>;
export declare const zh: Record<ScholarSearchLocaleKey, string>;
