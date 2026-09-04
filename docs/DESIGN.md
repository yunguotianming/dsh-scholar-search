# dsh-scholar-search 插件结构文档（审阅稿）

## 1. 定位与目标

- **名称**：`dsh-scholar-search`（npm 包名，与 dsh-ai4scholar 同级的独立第三方插件）
- **位置**：`E:\project-workspace\ai-projects\deepseek-harness\plugins\self-developed\dsh-scholar-search\`
- **性质**：独立 npm 包，**不属于** dsh 主仓库 workspace；构建后通过 `dsh plugin --profile web add dsh-scholar-search` 安装
- **目标**：替代 dsh-ai4scholar 的付费检索能力——全部检索走免费公开 API（OpenAlex / Semantic Scholar / PubMed / Europe PMC / arXiv / bioRxiv·medRxiv / Crossref / DOAJ / CORE / OpenAIRE / Unpaywall），下载走"OA 优先、多源 fallback"链，可选灰色渠道（默认关闭），不消耗任何积分

## 2. 安装与加载机制（与 dsh-ai4scholar 相同）

dsh 通过包 `package.json` 里的 `"dsh"` 声明识别插件：

```jsonc
{
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // 安装时 merge 进 profile：一行 - id: scholar-search / name: dsh-scholar-search
    "client": { "platform": "web", "inject": [...] } // 可选：Web 设置页卡片
  }
}
```

`cordis.patch.yml` 内容（整包只有这一行是 load-bearing 的）：

```yaml
- insert:
    - id: scholar-search
      name: 'dsh-scholar-search'
```

## 3. 目录结构

```
plugins/self-developed/dsh-scholar-search/
├── package.json            # 见 §4
├── tsconfig.json           # typecheck（noEmit）
├── tsconfig.build.json     # tsc → lib/（host 端）
├── tsconfig.client-types.json  # client 类型声明
├── tsdown.config.ts        # client 端打包：复刻 dsh 未发布的 clientBundle preset（lazy-CJS factory，见 §9）
├── cordis.patch.yml        # dsh 挂载声明（见 §2）
├── README.md / README_CN.md
├── LICENSE                 # MIT
├── src/
│   ├── index.ts            # Cordis 插件入口：name/inject/Config/apply（无 default export）
│   ├── types.ts            # PaperMeta 归一化模型 + ScholarSource 接口（仅类型）
│   ├── paper.ts            # 归一化/去重/合并/质量加权排序（借鉴 local_paper_hub ranker/dedupe）
│   ├── download.ts         # PDF 下载 fallback 链
│   ├── pdf.ts              # PDF 文本抽取（pdf-parse）
│   ├── prompt.ts           # systemPrompt 引导段
│   ├── sources/
│   │   ├── openalex.ts         # 搜索主干，免费无 key，带 OA 状态+PDF 链接
│   │   ├── semanticscholar.ts  # 免费，openAccessPdf 字段，可选 API key
│   │   ├── pubmed.ts           # E-utilities（esearch+esummary），免费，可选 key，生物医学权威元数据
│   │   ├── arxiv.ts            # 免费，Atom XML 解析 + PDF 直链
│   │   ├── europepmc.ts        # 免费无 key，生物医学全文
│   │   ├── biorxiv.ts          # 免费，bioRxiv/medRxiv 预印本
│   │   ├── crossref.ts         # 免费带 mailto，元数据兜底 + DOI 解析
│   │   ├── doaj.ts             # OA 期刊补充
│   │   ├── core.ts             # 可选，需免费注册 key
│   │   ├── unpaywall.ts        # 仅 resolvePdf：DOI→OA PDF 权威源，仅需 email
│   │   ├── openaire.ts         # 仅 resolvePdf：欧洲 OA 聚合补链，免费无 key
│   │   ├── crossref_page.ts    # 仅 resolvePdf：DOI 出版商落地页 OA 链接解析
│   │   └── grayarea.ts         # 仅 resolvePdf：Sci-Hub 镜像，仅 allowGrayArea:true 时启用
│   ├── tools/
│   │   ├── search.ts           # scholar_search 工具
│   │   ├── download.ts         # scholar_download 工具
│   │   └── read.ts             # scholar_read 工具
│   └── client/             # Web 设置页卡片（第一版就做，见 §9）
│       └── index.tsx
└── tests/                  # vitest，mock fetch 的适配器单测
    ├── openalex.spec.ts
    ├── semanticscholar.spec.ts
    ├── pubmed.spec.ts
    ├── arxiv.spec.ts
    ├── paper.spec.ts         # 去重键/质量加权排序/OpenAlex abstract 重建
    └── download.spec.ts      # fallback 链顺序与降级行为
```

## 4. package.json 要点

```jsonc
{
  "name": "dsh-scholar-search",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "main": "./lib/index.js",
  "types": "./lib/index.d.ts",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/client-types/client/index.d.ts", "default": "./lib/client.js" },  // 可选
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "README_CN.md", "LICENSE"],
  "sideEffects": false,
  "keywords": ["dsh-plugin", "deepseek-harness", "academic", "paper-search", "openalex", "arxiv", ...],
  "engines": { "node": ">=22.19.0" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }   // 设置卡片（第一版就做）
  },
  "dependencies": {
    "pdf-parse": "^2.4.5"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": ">=4.0.1",
    "@deepseek-ai/dsh-tools": ">=0.1.0-rc.6",
    "@deepseek-ai/dsh-system-prompt": ">=0.1.0-rc.6",
    "@deepseek-ai/schemastery": ">=3.18.1"
    // 可选：dsh-settings（可视化配置）、dsh-host-webserver + react（设置卡片）
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",          // + build:client（可选）
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "prepare": "pnpm run build"
  }
}
```

## 5. 插件入口契约（src/index.ts）

```ts
export const name = 'scholar-search'
export const inject = ['tools', 'systemPrompt']   // ctx.settings / ctx.webServer 用 ctx.inject([...]) 可选挂载

export interface Config {
  /** Unpaywall 礼貌池邮箱（OpenAlex/Crossref 也用它做 mailto）。 */
  email?: string
  /** Semantic Scholar 可选 API key（无 key 时限流共享）。 */
  semanticScholarApiKey?: string
  /** CORE 可选 API key（免费注册）。 */
  coreApiKey?: string
  /** PubMed E-utilities 可选 API key（无 key 时 3 req/s，带 key 10 req/s）。 */
  pubmedApiKey?: string
  /** 启用灰色渠道（Sci-Hub 镜像）作为最后 fallback。默认 false，法律风险自负。 */
  allowGrayArea?: boolean
  /** 下载目录（相对 workspace 或绝对路径）。默认 "papers"。 */
  downloadDir?: string
  /** 启用的搜索源列表。默认全部（core 无 key 时自动跳过）。 */
  enabledSources?: string[]
  /** 每源超时 ms。默认 15000。 */
  sourceTimeoutMs?: number
}
export const Config: z<Config> = z.object({ ... })   // 每个字段带 description → 免费得到 settings UI 表单

export function apply(ctx: Context, config: Config): void {
  // 1. ctx.settings?.installSection('scholar-search', Config, config, ...)  // 可视化配置
  // 2. ctx.systemPrompt.section({ name: 'tool:scholar_search', ... })        // 引导段
  // 3. ctx.tools.register(defineTool(...)) × 3                               // scholar_search / scholar_download / scholar_read
}
```

要点：
- 无 default export（否则 Loader 丢弃整个 namespace）；
- 注册全部走 effect（dispose 自动卸载）；
- `email`/`apiKey` 走 settings section（支持 UI 热更新），不硬编码。

## 6. 核心抽象（src/types.ts）

```ts
/** 归一化文献元数据（所有源统一到此模型）。 */
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
  source: string            // 哪个源提供的
  sourceId: string          // 源内 id
}

/** 统一源接口。 */
export interface ScholarSource {
  readonly id: string
  search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]>
  /** 解析该文献的免费 PDF 直链（可选实现）。 */
  resolvePdf?(paper: PaperMeta, signal: AbortSignal): Promise<string | undefined>
}

export interface SearchQuery {
  query: string
  limit?: number
  yearFrom?: number
  yearTo?: number
}
```

## 7. 检索源清单与字段映射

**搜索源（10 个，实现 `search`）：**

| 源 | 端点 | 认证 | 覆盖 | PDF 字段 |
|---|---|---|---|---|
| OpenAlex（主干） | `api.openalex.org/works?search=` | 无（带 mailto） | 2.5 亿+ | `open_access.oa_url`、`best_oa_location.pdf_url`、`locations[]` |
| Semantic Scholar | `api.semanticscholar.org/graph/v1/paper/search` | 可选 key | 2 亿+ | `openAccessPdf.url` |
| PubMed | `eutils.ncbi.nlm.nih.gov/entrez/eutils/` esearch+esummary | 可选 key | 生物医学权威元数据（质量权重最高） | 无（靠 Europe PMC 补全文） |
| Europe PMC | `ebi.ac.uk/europepmc/webservices/rest/search` | 无 | 生物医学全文 | `fullTextUrlList`、PMC OA 全文 |
| arXiv | `export.arxiv.org/api/query` | 无 | 预印本 | `arxiv.org/pdf/{id}` 直链 |
| bioRxiv/medRxiv | `api.biorxiv.org/details/{server}/` | 无 | 预印本 | `www.{server}.org/content/{doi}v{n}.full.pdf` |
| Crossref | `api.crossref.org/works` | mailto | 元数据兜底（DOI 注册局，覆盖最全） | `link[]`（多需订阅）、`license` |
| DOAJ | `doaj.org/api/v2/search/articles` | 无 | OA 期刊 | `bibjson.link` |
| CORE | `api.core.ac.uk/v3/search/works` | 免费 key（可选） | 全球最大 OA 仓储聚合 | `downloadUrl` |

**OA 补链源（4 个，仅实现 `resolvePdf`，搜索结果经它们补 `pdfUrl`）：**

| 源 | 端点 | 认证 | 说明 |
|---|---|---|---|
| Unpaywall | `api.unpaywall.org/v2/{doi}?email=` | email | DOI→OA PDF 最权威合法来源 |
| OpenAIRE | `api.openaire.eu/search/publications` | 无 | 欧洲 OA 聚合；需过滤 namespace/schema 低价值 URL（参考 local_paper_hub） |
| crossref_page | DOI 出版商落地页 | 无 | 解析落地页 citation_pdf_url meta 标签，只补链接不绕过付费墙 |
| grayarea | Sci-Hub 镜像 | 无 | 仅 `allowGrayArea:true` 时启用，法律风险自负 |

PubMed 与 Europe PMC 数据重叠但互补（同 local_paper_hub 的做法）：PubMed 做权威元数据，Europe PMC 补全文链接。

## 8. 合并、去重与排序（src/paper.ts，借鉴 local_paper_hub）

**去重键优先级**（参考 `search_pipeline/dedupe.py` 的 `generic_result_keys`）：

```
doi:{doi}  →  arxiv:{arxivId}  →  pmid:{pmid}  →  canonical_url  →  normalize_title(title)
normalize_title: 小写、去标点、保留 CJK 字符、压缩空白
```

命中同一键的多源记录合并成一条：`source` 保留质量最高的来源，`oa_sources` 记录全部命中源，字段取各源最完整的值。

**源质量加权排序**（参考 `ranker.py` 的 `SOURCE_QUALITY`）：

```ts
const SOURCE_QUALITY = {
  pubmed: 1.0, europe_pmc: 0.92, semantic_scholar: 0.86, arxiv: 0.85,
  biorxiv: 0.8, openalex: 0.78, crossref: 0.74, doaj: 0.7, core: 0.7,
}
```

综合分 = 源内排名分 × 源质量权重 + 时效分（近 5 年加权）+ OA 加成（有 `openAccessPdfUrl` 的排前，方便后续下载）。

**OpenAlex abstract 重建**：OpenAlex 返回的摘要不是纯文本而是 `abstract_inverted_index`（词→位置数组），必须重建为句子（参考 local_paper_hub `providers_engine.py` 的 `_rebuild_abstract`）——这是容易踩的坑。

## 9. 下载 fallback 链（src/download.ts）

对一篇 `PaperMeta`，按以下顺序尝试解析免费 PDF，命中即下载：

```
1. OpenAlex best_oa_location.pdf_url / locations[].pdf_url
2. Unpaywall best_oa_location.url_for_pdf（需 DOI + email）
3. Semantic Scholar openAccessPdf.url
4. Europe PMC fullTextUrlList（availability == Free）
5. arXiv / bioRxiv 直链（有 arxivId / bioRxiv DOI 时直接拼）
6. OpenAIRE 全文链接（需 DOI/标题，过滤低价值 URL）
7. CORE downloadUrl（需 key）
8. crossref_page 落地页 citation_pdf_url（仅 OA 出版商会暴露）
9. 出版商 OA 模式识别（PLOS/Frontiers/MDPI 等 OA 出版商的 .pdf 直链模式，借鉴 dsh-ai4scholar pdf.ts）
10. grayarea（Sci-Hub，仅 allowGrayArea:true）
```

补链源遵循 local_paper_hub 的降级约定：401/403/429/验证码/空正文/超时一律降级为 warning 并跳过该源，不阻断链路、不绕过任何访问控制。

- 下载到 `downloadDir`（默认 `papers/`），文件名 `{safeTitle}_{year}_{sourceId}.pdf`；
- 每个 URL 校验 `http(s)` scheme，拒绝 `file:` 等；跟随重定向后校验最终 URL；
- 返回 `{ path, source, url, sizeBytes }`。

## 9. 可视化管理（两层都做）

**第一层**：`ctx.settings.installSection('scholar-search', Config, config)`。Config schema 每个字段写 `description` 后，dsh Web 设置页自动生成表单——源开关、email、apiKey、下载目录、allowGrayArea 全部可视化热更新。

**第二层（第一版就做）**：`src/client/index.tsx` 设置卡片（仿 dsh-ai4scholar），注册 `settings.plugin.item` 槽位（keyed by namespace，与第一层自动配对），提供：
- 各源连通性测试按钮（ping 每个 API 返回延迟/可用性）
- 当前配置摘要
- 一键跳转下载目录

**关键坑**：dsh 主仓库的 client 打包 preset（`packages/client/tsdown.client.ts` 的 `clientBundle`）**未发布**，外部包必须自己复刻 lazy-CJS factory 产物格式——`tsdown.config.ts` 参考 `docs/cookbook/adding-a-settings-card.md` 和 `packages/client/ui-settings-plugins` 的三行配置手写等价物。

## 10. 三个 model-facing 工具

| 工具 | 参数 | 返回 |
|---|---|---|
| `scholar_search` | `query`、`sources?`、`limit?`(默认20)、`yearFrom?`、`yearTo?` | 并行查启用源 → DOI/标题去重合并 → `PaperMeta[]`（带 `openAccessPdfUrl`） |
| `scholar_download` | `identifier`（DOI/arxivId/PMID/标题）或 `paper`（直接传搜索结果项）、`filename?` | fallback 链下载 → `{ path, source, url, sizeBytes }` 或 `{ error: 'no-free-fulltext', triedSources: [...] }` |
| `scholar_read` | `path` 或 `identifier`、`maxChars?`(默认 8000) | 下载（如需）+ pdf-parse 抽取 → `{ text, pageCount, truncated }` |

systemPrompt 引导段告知模型：查文献用 `scholar_search` 而非 `web_search`；下载用 `scholar_download`；全文阅读用 `scholar_read`。

## 11. 构建/测试/验证

```sh
cd plugins/self-developed/dsh-scholar-search
pnpm install
pnpm run typecheck && pnpm run test && pnpm run build
# 本地安装到 dsh：
cd <dsh 用户目录>
dsh plugin --profile web add file:E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search
```

- 单测：mock fetch + 录制的真实 API 响应，验证字段映射/去重/fallback 顺序；
- 手动 e2e：`scholar_search("attention is all you need")` 返回多源合并结果；`scholar_download` 对 arXiv:1706.03762 成功下载 PDF；
- peerDependencies 版本下限对齐 dsh-ai4scholar 已验证可用的 `>=0.1.0-rc.6`。

## 12. 明确不做

- 不接 Google Scholar（无官方 API，爬虫需代理池，性价比低）；
- 不做 auto-cite / sci-draw / 余额查询（付费代理的增值服务）；
- 不修改 dsh 主仓库（纯外部插件）；
- 默认不开灰色渠道。

## 13. 参考实现

- **dsh-ai4scholar**（MIT）：Cordis 插件结构（name/inject/Config/apply + defineTool + systemPrompt section）、`dsh.bundle.patch` 分发模式、出版商 PDF 模式表、pdf-parse 用法、arXiv/rxiv 适配器骨架。
- **QwenPaw `local_paper_hub`**（本地技能，`E:\project-workspace\ai-projects\qwenpaw\...\skills\local_paper_hub`）：逻辑借鉴（Python 实现，只翻译思路不复用代码）：
  - `providers_oa_discovery.py` → OpenAIRE / crossref_page 补链源及低价值 URL 过滤；
  - `ranker.py` → 源质量权重表与排序模型；
  - `search_pipeline/dedupe.py` → 去重键设计与标题归一化；
  - `providers_engine.py` → OpenAlex 字段提取与 abstract 倒排索引重建；
  - 降级约定：补链源遇 401/403/429/验证码/超时降级为 warning，不阻断链路。
- **openags/paper-search-mcp**（MIT）：25+ 源适配器的 URL 模板/字段映射参考。

## 14. 与 dsh-ai4scholar 的关系

- 可并存（工具名 `scholar_*` 与 ai4scholar 的工具名不冲突）；
- 建议停用 ai4scholar（`dsh plugin remove dsh-ai4scholar`）后使用本插件，避免模型面对两套学术工具。

---

## 已确认的决策

1. **包名**：`dsh-scholar-search` ✅
2. **设置卡片（§9 第二层）**：第一版就做 ✅
3. **灰色渠道**：保留 `allowGrayArea` 开关（默认关）✅
4. **构建工具**：host 端纯 `tsc`；client 端用 `tsdown` 复刻 `clientBundle` preset ✅
5. **工具数量**：超出单个插件的范畴——用户目标是把 dsh 扩展为个人科研工作台，见 `WORKBENCH.md` 的整体规划。
