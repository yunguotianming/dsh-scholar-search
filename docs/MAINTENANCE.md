# dsh-scholar-search 维护文档

> 免费学术文献搜索 + OA 全文下载插件（DeepSeek Harness / Cordis 插件）
> 版本 0.3.1 · 本文档面向后期维护者，记录设计决策、架构、实现细节和踩过的坑

---

## 灰色渠道默认可用（2026-11-05）

- 设置卡片与配置 Schema 已移除灰色渠道启用开关，卡片固定显示“灰色渠道默认可用”。旧配置中的 `allowGrayArea` 值不再参与下载判断。
- `scholar_download` 保持 OA 优先、灰色渠道最后兜底的顺序；`scholar_scihub_download` 可直接调用。`grayAreaMirrors` 继续支持镜像列表配置。
- 回归用例位于 `tests/scihub.spec.ts` 的“灰色渠道默认可用”分组，覆盖默认兜底、旧值为 false 时的直接下载、OA 命中后停止回退，以及设置卡片文本字段保存。

## 检索与下载复盘后的维护要点

- `src/download.ts` 的异步回退生成器负责按需解析。OpenAlex 和 Unpaywall 返回去重后的 PDF 直链及开放落地页；落地页提取的 PDF 链接只试一层。`buildFallbackChain` 返回候选及落地页，供调用方完整探测。
- 下载前以随机独占文件试写目标目录并清理；最终文件独占写入，避免覆盖。失败结果区分目录错误、文件已存在、无候选、候选失败及来源异常，`attempts` 保留具体来源、URL 和原因。
- `src/tools/download.ts` 保留批量结构化逐篇结果。文本汇总给出已保存路径和待补齐文献，后者包括 DOI、失败原因和最多两个链接。批量在工具预算前主动结束，`failed` 与 `skipped` 分开统计。
- `src/pdf.ts` 用首页题名或 DOI 核对 PDF 身份。明确错配的候选会跳过且从人工补齐链接中移除。扫描件及其他证据不足的文件可保存，结果标为 `unverified`。
- Crossref 精确 DOI 查询和字段映射位于 `src/sources/crossref.ts`。`verifyMetadata=true` 时标题不符或元数据未核实会阻止该篇下载；返回规范元数据供复核。在线年单独保留，卷期年优先，不再用注册记录的 `created` 年充当出版年。
- `src/paper.ts` 使用共享合并逻辑处理普通去重与排序；强标识冲突不能靠同名记录合并，后续桥接记录能合并此前分开的相同论文。
- `src/prompt.ts` 记录按研究问题选源、低召回拆查询、中国情境补查中文库，以及全文下载与全文核对的区别。它不替代用户的下载授权或本地规则。
- 相关回归位于 `tests/download.spec.ts`、`tests/paper.spec.ts`、`tests/sources.spec.ts` 和 `tests/tools.spec.ts`。文件测试可通过 `SCHOLAR_TEST_TEMP_DIR` 指定项目约定临时目录，结束后清理；不设置时使用系统临时目录。

验收范围和当前参数以 [设计文档的验收补充](DESIGN.md#检索与下载复盘对应的验收补充) 与 [中文说明](../README_CN.md#scholar_download--下载-pdf) 为准。网络挑战页和机构认证的真实可用性需要在目标环境另行验证；HTTP 403 不单独作为“缺少机构网”的证据。

## 本地 MCP 入口

`src/mcp/stdio.ts` 使用官方 TypeScript MCP SDK 启动本地进程。标准输出承载协议消息，启动和传输错误写入标准错误流。源码构建生成 `lib/mcp/stdio.js`，并通过包的 `bin` 声明提供 `dsh-scholar-mcp`。

MCP 进程通过环境变量配置来源。通用工具每次调用的总预算为 30 秒，单次来源请求的超时为 8 秒。知网工具另有 30 秒启动预算，首次调用才连接内置服务。客户端取消沿查询信号传到来源。开放全文定位返回开放候选和文章页，访问验证和文件保存由 DSH 下载入口负责。客户端配置见 [MCP 接入](../README_CN.md#mcp-接入)。

知网桥接读取 FastMCP 的结构化结果和文本兼容结果。上游工具错误会传回客户端。独立 MCP 在关闭连接时释放桥接；显式配置的上游端点由其启动方维护。

中文下载在验证本次目录确认编号后启用项目内的 Playwright。确认编号保存在 MCP 连接内，验证通过后立即消耗。客户端负责向用户展示待确认目录并取得答复。文献浏览器使用专用持久配置，一次处理一篇下载，MCP 连接结束时关闭。确认后执行下载的预算为 60 秒。验收检查首次调用无下载副作用、确认编号一次使用、目录变更重新确认，以及实际文件路径、同名保护和认证交接。DSH 宿主的站内入口工具见 [现有使用说明](../README_CN.md#chinese_scholar_download--中文全文下载入口)。

## 目录

1. [项目背景与目标](#1-项目背景与目标)
2. [总体架构](#2-总体架构)
3. [目录结构与文件职责](#3-目录结构与文件职责)
4. [核心抽象](#4-核心抽象)
5. [检索源详解](#5-检索源详解)
6. [下载 fallback 链](#6-下载-fallback-链)
7. [Europe PMC 官方 API（核心通道）](#7-europe-pmc-官方-api核心通道)
8. [请求频率限制](#8-请求频率限制)
9. [浏览器下载（Playwright）](#9-浏览器下载playwright)
10. [Web 设置卡片（Client 半）](#10-web-设置卡片client-半)
11. [配置项](#11-配置项)
12. [构建与打包](#12-构建与打包)
13. [安装/更新/卸载](#13-安装更新卸载)
14. [测试](#14-测试)
15. [踩过的坑（重要）](#15-踩过的坑重要)
16. [已知限制与未来方向](#16-已知限制与未来方向)
17. [参考实现致谢](#17-参考实现致谢)

---

## 1. 项目背景与目标

### 1.1 为什么做这个插件

[dsh-ai4scholar](https://github.com/literaf/dsh-ai4scholar) 是 dsh 生态里已有的学术检索插件，但它的核心检索能力（Semantic Scholar、PubMed、Google Scholar）**全部走作者自营的付费代理 `ai4scholar.net`，每次调用消耗积分**。

调研发现：这些付费代理背后调用的 API 本身就有**免费公开版本**（Semantic Scholar Graph API、NCBI E-utilities、arXiv API 等），付费代理只是包了一层转发并计费。因此本插件的目标是：

- **全部检索走免费公开学术 API**，不经过任何付费代理，不消耗积分
- **中文论文检索覆盖 CNKI、万方和维普**：CNKI 使用随包分发的 cnki-mcp，万方和维普使用现有 dsh-browser 工具
- **下载走"OA 优先、多源 fallback"链**，尽可能从公开免费渠道拿到全文 PDF
- 灰色渠道（Sci-Hub）默认可用，作为 OA 来源之后的最后 fallback；直下工具无需开关
- 登录、机构认证、验证码和受限全文下载由用户处理

### 1.2 定位

- **独立的第三方 Cordis 插件**（npm 包 `dsh-scholar-search`），不属于 dsh 主仓库 workspace
- 通过 `dsh plugin --profile web add` 安装，和 dsh-ai4scholar 同等地位
- 与 dsh-ai4scholar 可并存（工具名 `scholar_*` 不冲突），但建议替换使用

### 1.3 演进历史（三轮实测驱动）

| 轮次 | 成功率 | 关键突破 |
|------|--------|---------|
| 第一轮 | 54% (27/50) | 摸清通道行为：crossref_page 是 BMC/Springer 主力、identifier 路径有缺口 |
| 第二轮 | 84% (71/84) | **发现 Europe PMC `api/getPdf` 官方端点**，PMC 论文几乎 100% 可下 |
| 第三轮 | 87% (101/116) | Europe PMC REST 批量反查 PMCID，识别"伪装反爬"的 OA 论文 |

**核心经验**：大量"出版商反爬"的论文（Wiley/Elsevier/SAGE/MDPI）其实在 PMC 有合法 OA 副本，只是回退链没走到 Europe PMC 官方 PDF API。这是把成功率从 54% 提到 87% 的关键。

---

## 2. 总体架构

### 2.1 Cordis 插件形态

dsh（DeepSeek Harness）是"全插件 Cordis 微内核"——一切产品功能都是插件。本插件是标准的 **Cordis 函数插件**：

```ts
// src/index.ts
export const name = 'scholar-search'
export const inject = ['tools', 'systemPrompt']  // settings/webServer 用 ctx.inject 可选挂载
export const Config: Schema<Config> = Schema.object({ ... })
export function apply(ctx: Context, config: Config): void { ... }
```

**关键约束**：
- **不能有 default export**（否则 Loader 丢弃整个 namespace）
- 注册全部走 effect（`ctx.tools.register`、`ctx.systemPrompt.section` 等返回 disposer，dispose 自动卸载）

### 2.2 两个半区（Host + Client）

| 半区 | 位置 | 构建 | 作用 |
|------|------|------|------|
| **Host 半** | `src/`（除 `src/client/`） | `tsc -p tsconfig.build.json` → `lib/` | Cordis 插件、工具、检索源、下载链 |
| **Client 半** | `src/client/` | `tsdown` → `lib/client.js` + `tsc -p tsconfig.client-types.json` → `lib/client-types/` | Web 设置卡片（React） |

通过 `package.json` 的 `"dsh": { "bundle": {...}, "client": {...} }` 声明，dsh 的 client module 系统自动把 `lib/client.js` 提供给浏览器。

### 2.3 数据流

```
模型调用 scholar_search
  → tools/search.ts
  → sources/index.ts (buildSources，throttle 包装)
  → 并行查 10 个源（openalex/s2/pubmed/europepmc/arxiv/...）
  → paper.ts 合并去重 + 质量加权排序
  → 返回 PaperMeta[]

模型调用 chinese_scholar_search
  → tools/chinese-search.ts
  → CNKI 调用内置 cnki-mcp；万方/维普串行调用 dsh-browser browser_* 工具
  → 结果转换为 PaperMeta（含 keywords），分别报告失败来源

模型调用 scholar_download
  → tools/download.ts
  → 试写目标目录，按需核对 DOI 元数据
  → download.ts 逐级解析并立即尝试 OA PDF，命中即止
  → fetchPdfBytesDetailed 下载（Europe PMC 自动重试 3 次）
  → 失败时 browser.ts (Playwright) 重试反爬出版商
  → 保存到 downloadDir（会话工作区）
```

---

## 3. 目录结构与文件职责

```
dsh-scholar-search/
├── package.json            # npm 清单 + dsh.bundle/client 声明 + 构建脚本
├── tsconfig.json           # typecheck（noEmit，strict）
├── tsconfig.build.json     # host 端编译（exclude src/client）→ lib/
├── tsconfig.client-types.json  # client 类型声明 → lib/client-types/
├── tsdown.config.ts        # client 端打包（复刻 dsh 未发布的 clientBundle preset）
├── cordis.patch.yml        # dsh 挂载声明（一行 insert）
├── vitest.config.ts        # 测试配置
├── README.md / README_CN.md  # 用户文档（双语）
├── LICENSE                 # MIT
├── docs/
│   └── MAINTENANCE.md      # 本文档
├── src/
│   ├── index.ts            # 插件入口：name/inject/Config/apply，settings/webServer 挂载
│   ├── types.ts            # PaperMeta 归一化模型 + ScholarSource 接口（仅类型）
│   ├── runtime.ts          # Runtime 接口（工具闭包读取的实时配置）
│   ├── http.ts             # 共享 fetch 助手（超时/User-Agent/降级/ID 规范化）
│   ├── paper.ts            # 合并去重 + 质量加权排序 + OpenAlex abstract 重建
│   ├── download.ts         # PDF 下载 fallback 链 + fetchPdfBytes(Detailed)
│   ├── pdf.ts              # pdf-parse 文本抽取 + 分片
│   ├── prompt.ts           # systemPrompt 引导段
│   ├── throttle.ts         # per-source 最小间隔限流
│   ├── browser.ts          # Playwright 浏览器下载（反爬出版商重试）
│   ├── chinese/
│   │   ├── cnki-mcp.ts     # 内置 cnki-mcp 的 HTTP 客户端、自动启动和生命周期
│   │   └── browser-workflow.ts # 万方/维普 详情与三站下载入口工作流
│   ├── shared/
│   │   └── constants.ts    # host/client 共享常量（namespace/route/PingResponse）
│   ├── sources/            # 检索源适配器（每源一个文件）
│   │   ├── index.ts            # buildSources 注册表 + throttle 包装
│   │   ├── openalex.ts         # OpenAlex（搜索主干）
│   │   ├── semanticscholar.ts  # Semantic Scholar
│   │   ├── pubmed.ts           # PubMed E-utilities
│   │   ├── europepmc.ts        # Europe PMC（含官方 getPdf 通道）
│   │   ├── arxiv.ts            # arXiv（Atom XML 解析）
│   │   ├── biorxiv.ts          # bioRxiv/medRxiv
│   │   ├── crossref.ts         # Crossref（元数据兜底）
│   │   ├── doaj.ts             # DOAJ
│   │   ├── core.ts             # CORE（可选 key）
│   │   ├── google_scholar.ts   # Google Scholar via SerpAPI（可选 key）
│   │   ├── unpaywall.ts        # Unpaywall（仅 resolvePdf，机构仓库）
│   │   ├── openaire.ts         # OpenAIRE（仅 resolvePdf）
│   │   ├── crossref_page.ts    # Crossref 落地页解析（仅 resolvePdf，BMC/Springer 主力）
│   │   └── grayarea.ts         # Sci-Hub 镜像（仅 resolvePdf，默认可用）
│   ├── tools/              # model-facing 工具
│   │   ├── search.ts           # scholar_search
│   │   ├── download.ts         # scholar_download
│   │   ├── read.ts              # scholar_read
│   │   └── chinese-search.ts    # chinese_scholar_search / chinese_scholar_detail
│   └── client/             # Web 设置卡片（React，浏览器半）
│       ├── index.ts            # client 入口：注册 settings.plugin.item 槽位
│       ├── Card.tsx            # 卡片组件（配置摘要 + 可编辑表单 + 连通性测试）
│       ├── controller.ts       # 状态管理（读 settingsScope + ping 路由 + 编辑写回）
│       ├── locales.ts          # zh/en 字典 + LocaleNamespaceMap 声明合并
│       └── styles.ts           # 样式（字符串注入，无 CSS pipeline）
├── vendor/cnki-mcp/           # GPLv3 CNKI MCP 源码（上游 0.2.0）、来源备注和许可证，随包分发
└── tests/                  # vitest 单测
    ├── paper.spec.ts           # 去重键/排序/abstract 重建
    ├── download.spec.ts        # fetchPdf/safeFilename/pdfCandidates
    ├── sources.spec.ts         # 各源字段映射（mock fetch）
    ├── throttle.spec.ts        # 限流逻辑
    └── chinese.spec.ts         # 中文快照解析、URL 校验和 cnki-mcp 响应规范化
```

---

## 4. 核心抽象

### 4.1 PaperMeta（归一化文献模型）

所有检索源统一映射到这个模型（`src/types.ts`）：

```ts
export interface PaperMeta {
  title: string
  authors?: string[]
  year?: number
  venue?: string
  abstract?: string
  keywords?: string[]
  doi?: string
  arxivId?: string
  pmid?: string
  pmcid?: string
  citationCount?: number
  isOpenAccess?: boolean
  openAccessPdfUrl?: string    // 关键：已知 OA PDF 直链
  landingPageUrl?: string
  source: string               // 哪个源提供的
  sourceId: string             // 源内 id
  oaSources?: string[]         // 合并后：命中了哪些源
}
```

### 4.2 ScholarSource（统一源接口）

```ts
export interface ScholarSource {
  readonly id: string
  /** 搜索。失败的源降级为空列表，不打断 fan-out。 */
  search(query: SearchQuery, signal: AbortSignal): Promise<PaperMeta[]>
  /** 解析该文献的免费 PDF 直链（可选，补链源只实现这个）。 */
  resolvePdf?(paper: PaperMeta, signal: AbortSignal): Promise<string | undefined>
}
```

- **搜索源**（10 个）实现 `search`：openalex、semantic_scholar、pubmed、europe_pmc、arxiv、biorxiv、crossref、doaj、core、google_scholar
- **补链源**（4 个）只实现 `resolvePdf`：unpaywall、openaire、crossref_page、grayarea

### 4.3 Runtime（工具闭包读取的实时配置）

```ts
export interface Runtime {
  fetchOptions: () => FetchOptions          // email + 超时，每次调用实时读
  enabledSources: () => string[]             // 启用的源，支持热更新
  registry: SourceRegistry                   // 源注册表
  browser?: BrowserDownloader                // 可选浏览器下载
  resolveDownloadDir: (exec) => string       // 每次调用从会话工作区解析下载目录
  pdfTimeoutMs / toolTimeoutMs / readMaxChars: number
  cnkiMcp?: CnkiMcpManager
  chineseSearchEnabled: () => boolean
}
```

**关键设计**：所有配置通过 `() => T` 函数实时读取（而不是 apply 时固化），配合 settings 热更新。

---

## 5. 检索源详解

### 5.1 公开 API 搜索源（10 个）

| 源 | 端点 | 认证 | 覆盖 | 默认间隔 |
|---|---|---|---|---|
| **OpenAlex**（主干） | `api.openalex.org/works?search=` | 无（带 mailto） | 2.5 亿+ | 100ms |
| Semantic Scholar | `api.semanticscholar.org/graph/v1/paper/search` | 可选 key | 2 亿+ | 100ms |
| PubMed | `eutils.ncbi.nlm.nih.gov/entrez/eutils/` | 可选 key | 生物医学权威 | 334ms (3 req/s) |
| **Europe PMC** | `ebi.ac.uk/europepmc/webservices/rest/search` | 无 | 生物医学全文 | 100ms |
| arXiv | `export.arxiv.org/api/query` | 无 | 预印本 | **3000ms**（官方要求 3s） |
| bioRxiv/medRxiv | `api.biorxiv.org/details/{server}/` | 无 | 预印本 | 500ms |
| Crossref | `api.crossref.org/works` | mailto | 元数据兜底 | 100ms |
| DOAJ | `doaj.org/api/v2/search/articles` | 无 | OA 期刊 | 200ms |
| CORE | `api.core.ac.uk/v3/search/works` | 免费 key（可选） | OA 仓储聚合 | 500ms |
| Google Scholar | `serpapi.com/search?engine=google_scholar` | SerpAPI key（可选） | 补充 | 1000ms |

### 5.2 补链源（4 个，仅 resolvePdf）

| 源 | 作用 |
|---|---|
| **Unpaywall** | DOI → 机构仓库 OA PDF（KCL Pure、SDU、Bristol 等），原站反爬时的关键替代 |
| OpenAIRE | 欧洲 OA 聚合补链 |
| crossref_page | 解析出版商落地页 `citation_pdf_url` meta 标签，**BMC/Springer 主力通道**（~95% 成功率） |
| grayarea | Sci-Hub 镜像（默认可用，最后兜底） |

### 5.3 中文检索、详情与下载入口

中文检索由独立的 `chinese_scholar_search` 工具提供，不改变普通 `scholar_search` 的 API source fan-out。

| 来源 | 实现 | 登录态 | 备注 |
|---|---|---|---|
| CNKI | 内置 `vendor/cnki-mcp` 的 Streamable HTTP 客户端 | `~/.cnki-mcp` 持久化 profile | 首次需手工 `cnki-mcp init`，可按需自动启动服务 |
| 万方 | dsh-browser `browser_*` 嵌套调用 | dsh-browser 当前受控标签页 | 读取快照和详情文本，不执行任意 JavaScript |
| 维普 | dsh-browser `browser_*` 嵌套调用 | dsh-browser 当前受控标签页 | 验证码和访问限制由用户处理 |

`chinese_scholar_detail` 将三个站点的详情字段转换为 `PaperMeta`：CNKI 走 `cnki-mcp` 的 `get-info-from-url` 并映射 `volume`/`issue`/`pages`/`doi`/`institution`；万方用一次 `div.detailList` 的整块文本按“标签：值”切分，补齐 `publishDate`、`onlinePublishDate`、`organizations`、`funds`、`classifications` 与页码区间；维普从主数据块提取 DOI 与关键词。缺失字段省略，不推算。

`chinese_scholar_download` 只做三件事：打开详情页、解析站点自身下载入口、在确认后按 `open` 在新的受控标签页打开它。

- 下载候选来自快照交互元素（`role` + `href`），先按站点域名白名单过滤（`cnki.net` / `wanfangdata.com.cn` / `cqvip.com`），再排除详情页自身，最后按格式与名称路径打分：PDF +8、CAJ +2、`下载/全文` +4、路径含 download/pdf +3，导航类链接扣分。阅读页（HTML 阅读、原版阅读）直接排除。
- 格式由 `formatOfDownload` 判定：名称或 URL 含 PDF → `pdf`，含 CAJ 或 `btn-dlcaj` → `caj`，只有「下载」字样 → `other`。知网同时提供 PDF/CAJ 时选 PDF；只剩 CAJ 时 `status` 为 `caj-only`，`message` 说明 CAJ 需要 CAJViewer 等专用阅读器、不能改扩展名冒充 PDF。
- 整页快照没有命中时，按站点区域（CNKI `.download-btns`、万方 `div.detailIcon` / `div.buttons`、维普 `div.mainContainerDataList-item`）再读一次。
- 默认 `open=false`：先解析并报告题名、格式、入口，用户确认后再传 `open=true`。`opened` 只表示入口已在浏览器打开，不等于下载完成；调用方需核对下载列表的文件名与保存位置，不猜目录、不覆盖同名文件。
- 文件由浏览器保存，插件不读取、不落盘，因此不产生 `%PDF` 校验与文件大小。`scholar_download` 的 OA 链路不受影响。

中文工具串行执行，避免同时操作一个受控标签页。

### 5.4 合并去重与排序（paper.ts）

**去重键优先级**（参考 QwenPaw local_paper_hub）：
```
doi:{doi} → arxiv:{arxivId} → pmid:{pmid} → url:{canonical_url} → title:{normalize_title}
```

**源质量加权**（`SOURCE_QUALITY`）：
```
pubmed: 1.0, europe_pmc: 0.92, semantic_scholar: 0.86, arxiv: 0.85,
biorxiv: 0.8, openalex: 0.78, crossref: 0.74, doaj: 0.7, core: 0.7
```

综合分 = 源内排名分 × 源质量权重 + 近 5 年时效加成 + OA 加成（有 `openAccessPdfUrl` 排前）。

**OpenAlex abstract 重建**：OpenAlex 返回的摘要是 `abstract_inverted_index`（词→位置数组），必须重建为句子（`rebuildAbstract`）。这是容易踩的坑。

---

## 6. 下载 fallback 链

对一篇 `PaperMeta`，按以下顺序逐级解析并尝试下载；`buildFallbackChain` 可用于完整探测：

```
1. europe_pmc         ← 官方 getPdf，可按 DOI/PMID 反查 PMCID
2. direct             ← openAccessPdfUrl 原站直取（PLOS/Frontiers/BMC 友好）
3. openalex           ← OpenAlex 解析 OA PDF
4. unpaywall          ← 机构仓库副本
5. semantic_scholar   ← S2 登记的 OA 链接
6. preprint           ← arXiv/bioRxiv 直链模式
7. openaire           ← OpenAIRE 补链
8. core               ← CORE 仓储
9. crossref_page      ← 出版商落地页 meta
10. publisher_patterns ← 出版商 OA URL 模式识别
11. grayarea          ← Sci-Hub（默认可用）
```

**关键设计决策**：
- **Europe PMC 前置到第 1 位**（有 PMCID 时）：它的官方 getPdf 端点是医学/护理最高效通道
- **逐级执行**：在已知直链之后查 OpenAlex，保留裸 identifier 的补链能力；已命中的下载不会触发后续来源查询
- **每级即使没候选也记录到 `attempted`**：失败时 `triedSources` 显示所有尝试过的级别，便于诊断
- **失败细分状态码**：`failures` 字段带原因（`direct:wiley.com(http-403)`、`direct:zenodo.org(not-pdf)`），区分"反爬"与"无此文件"

---

## 7. Europe PMC 官方 API（核心通道）

### 7.1 为什么它是核心

Wiley、Elsevier、Lancet、SAGE、MDPI、BMJ、Cochrane、T&F 的官网 PDF 直取几乎全部 403 反爬。但**这些出版商的 OA 论文绝大多数被 PMC 收录**，而 Europe PMC 提供官方、稳定的 PDF 下载端点，不设反爬。实测中 14 篇高被引经典有 11 篇走此通道成功。

### 7.2 关键端点

**① 官方 PDF 下载**（两种等价形式）：
```
https://europepmc.org/api/getPdf?pmcid={pmcid}
https://europepmc.org/articles/{pmcid}?pdf=render
```
实测：**间歇性 403，重试 1-2 次即成功**。插件已内置重试（`fetchPdfBytes` 对 europepmc.org URL 自动重试 3 次、间隔 2s）。

**② DOI/PMID 反查 PMCID**：
```
GET https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:"{doi}"&resultType=core&format=json
```
返回关键字段：
- `pmcid` / `pmid`
- `isOpenAccess` / `inEPMC` / `inPMC` / `hasPDF`：**三者均为 N = 无 OA 全文，直接跳过**（节省无效请求）
- `fullTextUrlList[].url`：含 `?pdf=render` 官方 PDF 链接

### 7.3 实现要点（sources/europepmc.ts）

```ts
resolvePdf(paper):
  // 快速路径：已有 PMCID → 直接返回 getPdf URL（零元数据往返）
  if (paper.pmcid) return europePmcOfficialPdfUrl(paper.pmcid)
  // 慢速路径：DOI/PMID → search API 反查 PMCID → getPdf URL
  const record = await search(DOI:"..." , resultType: 'core')
  const pmcid = europePmcPmcidWithPdf(record)  // hasPDF/inPMC 为 N 时跳过
  if (pmcid) return europePmcOfficialPdfUrl(pmcid)
```

**注意**：`europePmcPdfUrl` 必须识别 `?pdf=render` 结尾的 URL（不只是 `.pdf` 结尾），否则会漏掉 Europe PMC 自己的渲染端点。

---

## 8. 请求频率限制

`src/throttle.ts` 实现 per-source 最小间隔限流（`buildThrottle` + `throttleSource` 包装每个源）。

**默认间隔**（`DEFAULT_SOURCE_MIN_INTERVALS`）按各源公开礼貌速率设置，见 §5.1 表。

**实现机制**：
- 每个源维护一个 `nextAllowedAt` 时间戳
- 调用前 `wait(sourceId)`：如果当前时间 < nextAllowedAt，sleep 差额
- 同一源的连续调用自动串行化，不同源互不影响
- 用户可通过 `sourceMinIntervals` 配置覆盖（如 `{"pubmed": 100}` 有 key 时加快）

---

## 9. 浏览器下载（Playwright）

### 9.1 目的

对 Wiley/Elsevier/SAGE/T&F/MDPI 等有反爬（Cloudflare/bot 检测）的 OA 出版商，直接 `fetch` 会被 403/cookie 挑战拦截。浏览器下载用**真实浏览器**重试这些被拒的 URL。

### 9.2 实现（src/browser.ts）

- `BrowserDownloader` 类：懒启动 Playwright，**复用系统 Chrome/Edge**（不下载额外浏览器），headless 模式
- 自动探测 chrome/msedge 通道，或 `browserExecutablePath` 指定
- 两种下载策略：
  1. Playwright `download` 事件（Content-Disposition PDF）
  2. 导航响应内联 PDF（body 是 `%PDF`）
- 每个 direct URL 被反爬拦截后，自动用浏览器重试一次

**合规说明**：浏览器只用于下载 fallback 链已确认的合法 OA 链接，不绕过付费墙。它解决的是"出版商反爬拦截程序化下载"，不是"访问订阅内容"。

### 9.3 关键实现细节

- **playwright-core 作为 dependency**（不是 peerDependency），懒加载 `await import('playwright-core')`——缺浏览器时不影响插件加载
- **复用系统浏览器**：`chromium.launch({ channel: 'chrome' })` 或 `{ channel: 'msedge' }`，避免下载 ~300MB Chromium
- **每个下载独立 context**（隔离 cookie），用完即关；浏览器实例复用
- **dispose 时关闭**：`ctx.effect(() => () => browser.close())`
- **配置开关**：`browserDownload`（默认 false），避免无浏览器环境报错

---

## 10. Web 设置卡片（Client 半）

### 10.1 功能

- **配置摘要**：显示当前下载目录、启用的源、灰色渠道状态、邮箱配置状态
- **可编辑表单**：email、4 个 API key（密码框）、downloadDir；灰色渠道默认可用，无启用开关
- **已配置字段显示**：邮箱/下载目录 placeholder 显示当前值，API key 显示 `••••••••••••` 占位符，标签旁有"已保存"徽章
- **源连通性测试**：ping 11 个源，显示延迟或失败原因

### 10.2 技术要点

**settings.plugin.item 槽位注册**（client/index.ts）：
```ts
ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
  name: 'settings.plugin.item',
  id: 'scholar-search',        // rc.6 需要 id
  key: 'scholar-search',       // rc.7+ 需要 key（同时传两个兼容两版）
  locale: NS,
  inject: face,
}, ScholarSearchCard))
```

**settingsScope 读写**：
- Host 半 `settings.register(namespace, Config, { base })` 注册命名空间
- Client 半 `ctx.settingsScope.bind({ namespace })` 拿到 scope
- `scope.getSnapshot().value` 读当前值，`scope.set(field, value)` 写回（自动热更新）

**rc.6 兼容性坑**：
- npm 发布的 `@deepseek-ai/dsh-settings@0.1.0-rc.6` **没有** `installSection`（主仓库才有）——用 `register()` + `scope.watch()` 代替
- **`settingsNamespace` 运行时导出不存在于 rc.6 的 lib**——值导入会报 "does not provide an export named"，改为类型断言 `SETTINGS_NAMESPACE as SettingsNamespace`
- `ctx.settingsScope` 的 Context 类型合并未发布到 rc.6——本地声明最小接口 + `ctx.get('settingsScope')` 优雅降级

**client 打包（tsdown.config.ts）**：
- dsh 主仓库的 `clientBundle` preset **未发布**，外部包必须自己复刻 lazy-CJS factory 产物格式
- 关键：`banner: window.__ModuleLoader__.load({id, factory: (require) => {` + `footer: return module.exports; } });` + `intro: var module = {...}`
- **bundle purity gate**：client 半禁止 `@deepseek-ai` 值导入（除 PLATFORM_MODULES 白名单），只能 type-only import——跨插件协作走 cordis 服务

---

## 11. 配置项

所有字段可选，settings 热更新（无需重启）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `email` | — | 礼貌池邮箱。Unpaywall 必填；OpenAlex/Crossref 礼貌池 |
| `semanticScholarApiKey` | — | S2 可选 key（无 key 共享公共限流） |
| `pubmedApiKey` | — | NCBI 可选 key（3→10 req/s） |
| `coreApiKey` | — | CORE 可选 key（免费注册） |
| `googleScholarApiKey` | — | SerpAPI key（Google Scholar，付费） |
| `grayAreaMirrors` | 内置列表 | 灰色渠道镜像 URL 模板 |
| `downloadDir` | `download/papers` | 下载目录（相对工作区或绝对） |
| `enabledSources` | 全部 | 参与检索的源子集 |
| `sourceTimeoutMs` | 15000 | 单源请求超时 |
| `pdfTimeoutMs` | 60000 | PDF 下载超时 |
| `toolTimeoutMs` | 30000 | 工具调用预算 |
| `readMaxChars` | 8000 | scholar_read 默认字符数 |
| `sourceMinIntervals` | 见 §8 | per-source 限流间隔覆盖 |
| `browserDownload` | false | 浏览器重试反爬下载 |
| `browserExecutablePath` | — | 浏览器路径（缺省探测 chrome/msedge） |
| `chineseSearchEnabled` | true | 启用中文论文工具 |
| `cnkiMcpAutoStart` | true | 首次 CNKI 调用时自动启动内置 cnki-mcp |
| `cnkiMcpEndpoint` | `http://127.0.0.1:7788/mcp` | cnki-mcp Streamable HTTP 地址 |
| `cnkiMcpExecutable` | `uv` | 自动启动命令 |
| `cnkiMcpProjectDir` | 插件内置 `vendor/cnki-mcp` | cnki-mcp 项目目录，可覆盖 |
| `cnkiMcpStartupTimeoutMs` | 30000 | 自动启动等待时间 |
| `cnkiMcpMinIntervalMs` | 3000 | CNKI 业务调用间隔，下限 1000ms |

---

## 12. 构建与打包

```sh
pnpm install
pnpm run build        # build:lib (tsc) + build:client (tsdown + tsc client-types)
pnpm run typecheck    # tsc --noEmit
pnpm run test         # vitest
```

**产物**：
- `lib/index.js` + `lib/*.d.ts`：host 半（tsc -p tsconfig.build.json）
- `lib/client.js` + `lib/client.js.map`：client 半（tsdown）
- `lib/client-types/`：client 类型声明（tsc -p tsconfig.client-types.json）

**package.json 关键字段**：
```jsonc
{
  "main": "./lib/index.js",
  "types": "./lib/index.d.ts",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/client-types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "files": ["lib", "vendor/cnki-mcp", "cordis.patch.yml", "README.md", "README_CN.md", "LICENSE"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": [...] }
  }
}
```

---

## 13. 安装/更新/卸载

### 安装

```powershell
cd E:\project-workspace\ai-projects\deepseek-harness\plugins\self-developed\dsh-scholar-search
pnpm install
pnpm run build
node "$HOME/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web add "file:E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search"
```

### 更新（重要：file: 是硬拷贝）

`file:` 协议安装是**硬拷贝**（不是符号链接），改代码后必须 build + 手动重装（`dsh plugin update` 对 file: 不重新拷贝）：

```powershell
pnpm run build
node "$HOME/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web remove dsh-scholar-search
node "$HOME/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web add "file:..."
# 重启 dsh web
```

### 卸载

```powershell
node "$HOME/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web remove dsh-scholar-search
```

已下载的 PDF（`download/papers/`）不会被删除。

---

## 14. 测试

95 个单测（vitest），覆盖：

- **paper.spec.ts**：normalizeTitle、paperKeys、mergePapers、mergePaperLists、scorePaper、mergeAndRank、rebuildAbstract
- **download.spec.ts**：looksLikePdf、safeFilename、pdfCandidatesFor、fetchPdfBytes（mock fetch）
- **sources.spec.ts**：normalizeOpenAlexWork、parseArxivFeed、normalizeSerpApiResult、europePmcOfficialPdfUrl、europePmcPmcidWithPdf、openAlexPdfCandidates、各源 search（mock fetch）
- **throttle.spec.ts**：buildThrottle 间隔/独立/abort、throttleSource 包装
- **chinese.spec.ts**：中文快照解析（角色、状态标记、href）、标签行字段切分、作者/DOI 规范化、下载候选筛选（域名白名单、排除详情页与阅读页、PDF 优先）、格式识别与 `caj-only`、工具层默认只解析、详情字段装配（用假 ctx 回放 dsh-browser 文本）、cnki-mcp 响应规范化

mock 方式：`vi.stubGlobal('fetch', vi.fn(...))` 录制真实 API 响应 JSON。

公开搜索 smoke 使用关键词“人工智能”验证万方和维普页面各返回 20 条结果，未登录且未触发下载；OpenAlex 和 Crossref 中文查询也能返回结果。该 smoke 验证站点公开搜索和参考解析脚本，完整 dsh-browser 工具链仍需在已连接扩展的会话中验证。CNKI 因本机尚无 `~/.cnki-mcp` profile 未执行真实查询。

---

## 15. 踩过的坑（重要）

### 15.1 dsh 版本兼容性（rc.6 vs 主仓库）

dsh 处于 pre-release，npm 发布的 `0.1.0-rc.6` 和主仓库 `0.1.2-alpha` API 不一致：

| 坑 | 现象 | 解法 |
|---|---|---|
| `installSection` 不存在 | rc.6 只有 `register()` | 用 `register()` + `scope.watch()` |
| `settingsNamespace` 运行时无导出 | "does not provide an export named" | 类型断言 `NS as SettingsNamespace` |
| `ctx.settingsScope` 类型未合并 | TS 报错 | 本地声明接口 + `ctx.get()` |
| client 槽位 rc.6/rc.7 不一致 | list vs keyed | 同时传 `id` 和 `key` |

**教训**：peerDependencies 对齐 `>=0.1.0-rc.6`，对未发布的 API 用类型断言 + 运行时降级，不做值导入。

### 15.2 dsh plugin update 对 file: 无效

`file:` 协议安装是硬拷贝，`dsh plugin update` **不会重新拷贝**。必须 remove + add。

### 15.3 process.cwd() 不是会话工作区

最初 `downloadDir` 用 `resolve(process.cwd(), dir)`，结果 PDF 下载到 harness 安装目录。**正确做法**：`exec.agent.session.header.cwd`（当前会话工作区），见 §4.3 `resolveDownloadDir`。

### 15.4 Europe PMC `?pdf=render` 识别

`fullTextUrlList` 里 Europe PMC 自己的 PDF URL 是 `...?pdf=render` 结尾（不是 `.pdf`），`europePmcPdfUrl` 必须额外匹配 `documentStyle === 'pdf'` 或 `[?&]pdf=render`。

### 15.5 Europe PMC getPdf 间歇性 403

官方 PDF 端点会间歇性 403，**重试 1-2 次即成功**。已在 `fetchPdfBytes` 对 europepmc.org URL 内置 3 次重试（间隔 2s）。

### 15.6 OpenAlex abstract 倒排索引

OpenAlex 的 `abstract_inverted_index` 是词→位置数组，不是纯文本，必须 `rebuildAbstract` 重建。

### 15.7 userscript 结果上限 100KB

曾考虑用 dsh-browser 的 `runUserscript` 在页面里 fetch PDF 转 base64，但结果上限 100_000 字符，PDF 会被截断。**结论**：不能用 dsh-browser 下载 PDF，只能插件自己集成 Playwright。

### 15.8 tried: none 链路缺口

只传 DOI 时，如果各级 resolvePdf 都没产出 URL，`levels` 为空 → `triedSources` 为空 → 显示 `tried: none`。修复：
- 加 `enrich:openalex` 反查步骤
- `attempted` 记录所有尝试过的级别（即使没候选）

### 15.9 中文检索与第三方运行时

- `cnki-mcp` 源码位于 `vendor/cnki-mcp`，许可证为 GPLv3，不能按 MIT 组件处理。
- `vendor/cnki-mcp/VENDOR.md` 固定上游仓库、提交 SHA 和版本；升级 vendor 时同步更新。当前同步到上游 `0.2.0`（`dcd7931`），相对 `0.1.1` 只有 `detail_parser.py` 把作者区的 `/organ/detail` 链接改归 `institution`（作者与机构不再混淆）、`pyproject.toml` 版本与 docs 依赖、以及文档；运行时依赖未变，MCP 工具名（`easy-search`、`get-info-from-url`）未变，客户端无需改动。
- 自动启动只管理插件自己创建的 `uv` 子进程；服务已有时直接复用，不停止外部进程。
- 首次 CNKI 使用仍需用户执行一次 `uv run cnki-mcp init` 完成登录或机构认证；凭据和 profile 不进入插件包。
- 万方和维普依赖 dsh-browser 当前的文本工具，无法执行中文 skill 原有的任意页面 JavaScript。
- `browser_get_text(selector)` 内部是 `document.querySelector`，**只返回第一个匹配元素**：列表字段（作者、关键词）必须读容器后按分隔符切分，不能指望选择器本身枚举多个节点；区域快照（`region`）也只影响主文，不裁剪交互元素清单。
- 下载入口不写在 `vendor/cnki-mcp` 里：上游把 `download_url` 置空并注明“暂时不要下载的功能”，插件因此统一改由 dsh-browser 读页面上的下载入口，避免修改 GPLv3 组件的合规判断。
- 插件进程不抓取中文全文，所以 `chinese_scholar_download` 没有 `%PDF` 校验和文件大小；这是与 `scholar_download` 有意不同的一处。

---

## 16. 已知限制与未来方向

### 已知限制

- **全文可用性取决于来源与访问条件**：`no-free-fulltext` 只表示本次没有取得 PDF，结合 `failureKind` 和 `attempts` 判断后续动作
- **Google Scholar 需 SerpAPI key**（付费）：无 key 时该源跳过
- **arXiv 在非 CS 领域噪音大**：护理/医学检索会混入 CS/ML 论文，未来可加 `excludeSources` 学科过滤
- **基础设施故障**：可识别下载的 DNS、超时、HTTP 和挑战页；来源解析接口仍可能把请求失败降级为空，空链不能证明没有 OA
- **批量总预算有限**：`papers` 顺序处理，预算用尽会返回当前结果与未尝试项；由调用方按结果分批重试
- **中文检索需要额外运行时**：CNKI 需要 Python 3.11+、uv、Playwright 和已初始化 profile；万方/维普需要连接的 dsh-browser 标签页
- **中文下载入口取决于用户权限**：`no-download-link` 不区分“没订阅”“未登录”“按钮没渲染”，只能结合页面状态人工判断；插件不代为登录或订阅
- **维普没有下载入口字段**：抽取规格不提供 `pdf_url`，该站点的预期结果是 `no-download-link`
- **CAJ 不是 PDF**：知网部分文献只提供 CAJ，工具返回 `caj-only`；插件不提供 CAJ 转 PDF，也不改扩展名
- **中文库选择器尚未逐站实测下载**：下载候选规则来自技能规格与 dsh-browser 快照格式；命中与否取决于页面当时的渲染，`no-download-link` 需要在真实会话中核对页面结构
- **作者列表靠文本切分**：dsh-browser 不支持执行页面脚本，`browser_get_text` 只取第一个匹配元素，拉丁姓名可能被按空格拆开，需要核对

### 未来方向（按优先级）

1. **批量并发调度**：在已有结构化逐篇结果与总量统计基础上，按源限流并发执行
2. **`excludeSources` / 学科过滤**：医学检索默认排除 arXiv（经验总结 P2-10）
3. **OA 状态与下载状态分离**：`oa_verified`（元数据确认 OA）vs `download_status`（downloaded/network_restricted/cloudflare/dns_failure/no_legal_oa），避免把"确认 OA 但当前不可达"误报为"付费"（经验总结 §12.1）
4. **下载前内容核验**：保存前读首页标题/DOI 与请求比对，不一致标记 `identity_mismatch`（经验总结 §12.7）
5. **来源解析诊断贯通**：让元数据补链请求也返回具体 HTTP／网络诊断，补齐当前下载候选的 `challenge` 等分类
6. **可验证下载**：Zenodo 等仓库读 `size`/`checksum` 做完整性校验（经验总结 §12.10）
7. **后台重试**：DNS 故障是临时的，记录"待重试"状态周期重试（经验总结 §10.2）

---

## 17. 参考实现致谢

- **[dsh-ai4scholar](https://github.com/literaf/dsh-ai4scholar)**（MIT）：Cordis 插件结构、`dsh.bundle.patch` 分发模式、client 设置卡片模式（含 rc.6/rc.7 槽位兼容 hack）、出版商 PDF URL 模式表、arXiv/bioRxiv 适配器骨架、tsdown.config.ts 复刻 clientBundle preset 范本
- **QwenPaw `local_paper_hub`**（Python，仅借鉴逻辑）：去重键设计（`search_pipeline/dedupe.py`）、源质量权重表（`ranker.py`）、OpenAlex abstract 重建与字段提取（`providers_engine.py`）、OA 补链降级约定（`providers_oa_discovery.py`）
- **[openags/paper-search-mcp](https://github.com/openags/paper-search-mcp)**（MIT）：25+ 源适配器的 URL 模板/字段映射参考
- **升级经验总结**（内部文档）：Europe PMC 官方 API 通道发现、三轮实测数据、失败模式分类——本文档 §1.3、§7 的核心依据
