/** Copy for the settings card, in the two locales the dsh web client ships. */

/** Dictionary namespace owned by this plugin's browser half. */
export const NS = 'scholar-search'

/** Copy keys of the card. */
export type ScholarSearchLocaleKey =
  | 'title'
  | 'description'
  | 'expand'
  | 'collapse'
  | 'configSummary'
  | 'emailSet'
  | 'emailUnset'
  | 'downloadDirLabel'
  | 'sourcesLabel'
  | 'grayAreaOn'
  | 'connectivity'
  | 'testAll'
  | 'testing'
  | 'reachable'
  | 'unreachable'
  | 'pingUnavailable'
  | 'source_openalex'
  | 'source_semantic_scholar'
  | 'source_pubmed'
  | 'source_europe_pmc'
  | 'source_arxiv'
  | 'source_biorxiv'
  | 'source_crossref'
  | 'source_doaj'
  | 'source_core'
  | 'source_google_scholar'
  | 'source_unpaywall'
  | 'source_openaire'
  | 'source_scihub'
  | 'editConfig'
  | 'fieldEmail'
  | 'fieldS2Key'
  | 'fieldPubmedKey'
  | 'fieldCoreKey'
  | 'fieldGoogleScholarKey'
  | 'fieldDownloadDir'
  | 'save'
  | 'clear'
  | 'saved'
  | 'saveFailed'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Scholar Search settings card. */
    'scholar-search': ScholarSearchLocaleKey
  }
}

export const en: Record<ScholarSearchLocaleKey, string> = {
  title: 'Scholar Search',
  description: 'Free academic search + OA download: OpenAlex, Semantic Scholar, PubMed, Europe PMC, arXiv, bioRxiv, Crossref, DOAJ, CORE',
  expand: 'Expand',
  collapse: 'Collapse',
  configSummary: 'Current configuration',
  emailSet: 'polite-pool email set',
  emailUnset: 'no email (Unpaywall disabled)',
  downloadDirLabel: 'Download dir',
  sourcesLabel: 'Enabled sources',
  grayAreaOn: 'gray-area fallback available by default',
  connectivity: 'Source connectivity',
  testAll: 'Test all sources',
  testing: 'Testing…',
  reachable: 'OK',
  unreachable: 'failed',
  pingUnavailable: 'Ping route unavailable (headless or older plugin build)',
  source_openalex: 'OpenAlex',
  source_semantic_scholar: 'Semantic Scholar',
  source_pubmed: 'PubMed',
  source_europe_pmc: 'Europe PMC',
  source_arxiv: 'arXiv',
  source_biorxiv: 'bioRxiv/medRxiv',
  source_crossref: 'Crossref',
  source_doaj: 'DOAJ',
  source_core: 'CORE',
  source_google_scholar: 'Google Scholar',
  source_unpaywall: 'Unpaywall',
  source_openaire: 'OpenAIRE',
  source_scihub: 'Sci-Hub',
  editConfig: 'Edit configuration',
  fieldEmail: 'Polite-pool email (礼貌池邮箱)',
  fieldS2Key: 'Semantic Scholar API key',
  fieldPubmedKey: 'PubMed API key',
  fieldCoreKey: 'CORE API key',
  fieldGoogleScholarKey: 'Google Scholar (SerpAPI) key',
  fieldDownloadDir: 'Download directory',
  save: 'Save',
  clear: 'Clear',
  saved: 'Saved',
  saveFailed: 'Save failed',
}

export const zh: Record<ScholarSearchLocaleKey, string> = {
  title: '学术搜索',
  description: '免费学术检索 + OA 下载：OpenAlex、Semantic Scholar、PubMed、Europe PMC、arXiv、bioRxiv、Crossref、DOAJ、CORE',
  expand: '展开',
  collapse: '收起',
  configSummary: '当前配置',
  emailSet: '已配置礼貌池邮箱',
  emailUnset: '未配置邮箱（Unpaywall 不可用）',
  downloadDirLabel: '下载目录',
  sourcesLabel: '启用的源',
  grayAreaOn: '灰色渠道默认可用',
  connectivity: '源连通性',
  testAll: '测试全部源',
  testing: '测试中…',
  reachable: '正常',
  unreachable: '失败',
  pingUnavailable: 'Ping 端点不可用（headless 或插件版本过旧）',
  source_openalex: 'OpenAlex',
  source_semantic_scholar: 'Semantic Scholar',
  source_pubmed: 'PubMed',
  source_europe_pmc: 'Europe PMC',
  source_arxiv: 'arXiv',
  source_biorxiv: 'bioRxiv/medRxiv',
  source_crossref: 'Crossref',
  source_doaj: 'DOAJ',
  source_core: 'CORE',
  source_google_scholar: 'Google Scholar',
  source_unpaywall: 'Unpaywall',
  source_openaire: 'OpenAIRE',
  source_scihub: 'Sci-Hub',
  editConfig: '编辑配置',
  fieldEmail: '礼貌池邮箱 (Polite-pool email)',
  fieldS2Key: 'Semantic Scholar API key',
  fieldPubmedKey: 'PubMed API key',
  fieldCoreKey: 'CORE API key',
  fieldGoogleScholarKey: 'Google Scholar（SerpAPI）key',
  fieldDownloadDir: '下载目录',
  save: '保存',
  clear: '清除',
  saved: '已保存',
  saveFailed: '保存失败',
}
