# dsh-scholar-search

[English](README.md)

当前版本：**0.3.1**。本版在 0.2.1 的下载目录试写、中文文件名、逐级下载回退、DOI 著录核对、去重修复与批量自动统计之上，补齐中文库详情字段与中文全文下载入口（含 PDF/CAJ 格式区分、先确认后打开），并同步内置 `cnki-mcp` 到上游 0.2.0。

[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 学术文献插件：通过免费学术接口检索文献、获取和读取开放获取（OA）全文，并支持中国知网、万方和维普的中文论文检索、详情字段与站内下载入口。

插件列表中的功能简介使用中文，由 `package.json` 的 `description` 字段提供。

## 功能

- **`scholar_search`** — 一次查询并行打到最多 10 个源（OpenAlex、Semantic Scholar、PubMed、Europe PMC、arXiv、bioRxiv/medRxiv、Crossref、DOAJ、CORE、Google Scholar），然后按 DOI → arXiv → PMID → canonical URL → 归一化标题 去重合并、按源质量加权排序。已知 OA 直链的结果会带上 `openAccessPdfUrl`。
- **`scholar_download`** — Europe PMC 优先，逐级尝试开放副本，保存前核对 PDF 首页身份。支持指定目录、中文文件名、批量去重计数，并为失败文献提供人工补齐链接。
- **`scholar_scihub_download`** — 直接通过 Sci-Hub 下载，完全绕过 OA fallback 链。并发探测所有配置的镜像，返回第一个可用的 PDF，默认可用。请确保你了解所在司法辖区的法律风险后再使用。
- **`scholar_read`** — 需要时先下载，再用 `pdf-parse` 抽取 PDF 文本，分片返回。
- **`chinese_scholar_search` / `chinese_scholar_detail` / `chinese_scholar_download`** — 搜索 CNKI、万方和维普，读取含 DOI、发表日期、机构、基金、分类号的详情字段，并解析、转交站点自身的全文下载入口。CNKI 通过本地 `cnki-mcp`（可按需自动启动），万方和维普使用已连接的 `dsh-browser`。
- Web 设置卡片（Settings → Plugins）：配置摘要 + 各源连通性测试（包括 Sci-Hub 各镜像的连通性）。

## 安装

### 前置条件

- dsh ≥ 0.1.0-rc.6（已在 0.1.2-alpha.2 上验证）
- Node.js ≥ 22.19

### 从 npm 安装（发布后）

```sh
dsh plugin --profile web add dsh-scholar-search
```

### 从本地源码安装（开发/当前方式）

```sh
# 1. 构建插件
cd E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search
pnpm install
pnpm run build

# 2. 安装到 dsh web profile
dsh plugin --profile web add "file:E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search"
```

> **注意**：`dsh` CLI 不在 PATH 时，用完整路径调用：
>
> ```sh
> node "$HOME/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web add "file:..."
> ```

安装后插件会：

- 出现在 `~/.dsh/profiles/web/node_modules/dsh-scholar-search/`（file: 协议下是**硬拷贝**，不是符号链接）
- 追加到 profile manifest 的 `dsh.profile.bundles` 列表末尾
- 下次启动 dsh web 时自动加载

插件已内置 `vendor/cnki-mcp` 的源码、`pyproject.toml` 和 GPLv3 许可证，不需要另外下载 `cnki-mcp` 仓库。首次使用 CNKI 时仍需本机安装 Python 3.11+、`uv` 和 Playwright 浏览器运行时；插件只会通过 `uv` 安装 Python 依赖，不会自动登录或下载受限全文。

## 启用与验证

安装完成后**重启 dsh web**：

```sh
dsh --profile web
```

验证插件已加载：

1. **工具目录**：在 dsh Web 对话中输入"搜索论文"，模型应能看到 `scholar_search` 工具
2. **设置卡片**：打开 Settings → Plugins，应能看到 "Scholar Search" 卡片，显示配置摘要和各源连通性测试按钮
3. **手动测试**：在对话中让模型执行 `scholar_search`，例如：
   ```
   用 scholar_search 搜索 "attention is all you need"
   ```

## 更新插件（本地源码方式）

由于 `file:` 依赖是硬拷贝，修改插件源码后需要重新构建并**手动重装**（`dsh plugin update` 对 file: 依赖不会重新拷贝）：

```sh
# 1. 重新构建
cd E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search
pnpm run build

# 2. 卸载旧版本
dsh plugin --profile web remove dsh-scholar-search

# 3. 重新安装
dsh plugin --profile web add "file:E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search"

# 4. 重启 dsh web
```

> **提示**：如果你频繁迭代，可以改用 `npm link` 建立符号链接 + watch 模式自动重建，见下文"开发"一节。

## 删除插件

```sh
dsh plugin --profile web remove dsh-scholar-search
```

删除后：

- 从 `~/.dsh/profiles/web/node_modules/` 移除
- 从 profile manifest 的 `dsh.profile.bundles` 移除
- 重启 dsh 后插件的工具和设置卡片消失

下载的 PDF 文件（在 `downloadDir`，默认 `<workspace>/download/papers/`）**不会**被删除。

## MCP 接入

MCP 客户端可以通过本地 `stdio` 调用通用文献检索、精确 DOI 查询、开放全文定位，以及中国知网检索与详情查询。源码安装完成后，执行 `pnpm run build:lib` 生成入口。使用支持 `mcpServers` 格式的客户端时，可按本机路径配置。

```json
{
  "mcpServers": {
    "scholar": {
      "command": "node",
      "args": [
        "E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search/lib/mcp/stdio.js"
      ]
    }
  }
}
```

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `scholar_search` | `query`，可选 `sources`、`limit`、`yearFrom`、`yearTo` | 去重排序后的题录及查询来源。默认返回 20 条，最多 50 条 |
| `scholar_lookup_doi` | `doi`，支持 DOI 原文或 `doi.org` 链接 | Crossref 精确题录。无可返回记录时为 `not-resolved` |
| `scholar_locate_open_access` | `identifier`，接受 DOI、arXiv ID 或 PMID | 按来源返回 PDF 候选和文章页。链接的访问状态需另行确认 |
| `chinese_scholar_search` | `query`，可选 `sources: ["cnki"]` 和 `limit` | 知网题录和详情页链接。默认 10 条，最多 20 条 |
| `chinese_scholar_detail` | `url`，使用知网检索返回的 `landingPageUrl` | 知网论文题录，包括可用的摘要、DOI、关键词和机构 |
| `chinese_scholar_download` | `url`、拟保存的绝对路径 `downloadDir`，可选 `title`、`doi`、`confirmationId` | 首次返回待确认目录。用户确认后下载，成功时返回本机保存路径、格式和大小 |

通过客户端传入 `SCHOLAR_EMAIL` 可启用 Unpaywall。需要使用已注册的检索 API 时，可传入 `SCHOLAR_SEMANTIC_SCHOLAR_API_KEY`、`SCHOLAR_PUBMED_API_KEY`、`SCHOLAR_CORE_API_KEY` 或 `SCHOLAR_GOOGLE_SCHOLAR_API_KEY`。如果 `node` 不在客户端的 PATH 上，`command` 使用 Node.js 的绝对路径。安装包也声明了 `dsh-scholar-mcp` 命令入口。

### 初始化知网

在插件根目录运行下面的 PowerShell 命令。首次使用需要 `uv`、Python 3.11 或更高版本，以及 Playwright 的 Chromium。已有可用的知网登录配置时，可直接开始查询。

```powershell
uv --directory .\vendor\cnki-mcp run playwright install chromium
uv --directory .\vendor\cnki-mcp run cnki-mcp init
```

在打开的浏览器中完成学校或机构认证。第一次知网查询时，插件复用 `http://127.0.0.1:7788/mcp` 上已运行的服务，或通过 `uv` 启动内置服务。客户端找不到 `uv` 时，可在环境变量 `SCHOLAR_CNKI_UV` 里填 `uv.exe` 的绝对路径。已有独立服务时，可设置 `SCHOLAR_CNKI_ENDPOINT`，由该服务的启动方管理进程。

### 下载中文全文文件

1. 向 MCP 工具 `chinese_scholar_download` 传知网、万方或维普的论文详情页 `url`，以及运行 MCP 的机器上的拟保存绝对目录 `downloadDir`。已知题名或 DOI 时可一并传入，用于核对 PDF。
2. 工具返回 `confirmation-required` 和本次 `confirmationId`。客户端向用户展示文献和工具返回的完整目录，等待明确答复。此时浏览器尚未启动，目录尚未创建。
3. 用户同意后，客户端用相同参数加 `confirmationId` 再次调用，才开始下载。编号在本次连接中有效 5 分钟，并在执行时使用一次。更换文献或目录、编号超时或重连后，重新确认。

第一次执行已确认的下载时会打开本机的 Chrome 或 Edge。登录、机构认证或验证码需要时，由用户在打开的文献浏览器里完成，再重试下载。浏览器登录状态存放在用户主目录的 `.dsh-scholar-search/browser`，也可通过 `SCHOLAR_CHINESE_BROWSER_PROFILE` 指定专用目录的绝对路径。知网检索和下载使用各自的浏览器配置。新建的文献浏览器配置默认下载内联 PDF，已有配置沿用当前 PDF 设置。

`downloaded` 返回 `path`、`format` 和 `sizeBytes`。PDF 的 `pdfVerification` 为 `matched` 或 `unverified`。CAJ 按实际格式保存为 `.caj`。同名文件返回 `file-exists`。遇到 `login-required`、`captcha`、`access-denied`、`no-download-link` 或 `download-failed` 时，浏览器会保留当前页面供用户处理。浏览器仅打开 PDF 预览且未取得文件字节时，返回 `manual-save`，可在阅读器中点击下载。维普依赖实页提供明确的站内下载控件。

## 使用方法

### `scholar_search` — 搜索文献

参数：

- `query`（必需）：搜索关键词（英文效果最好；中文查询建议先让模型翻译成英文）
- `sources`（可选）：指定源子集，默认全部启用
- `limit`（可选）：返回结果数，默认 20
- `yearFrom` / `yearTo`（可选）：年份过滤

按研究问题选源；例如生物医学主题可指定 `sources=["semantic_scholar","pubmed"]`，再补 Europe PMC 等开放获取来源。连字符别名（如 `semantic-scholar`）也可使用；未知源和全部未启用的源会明确报错。长查询召回较少时，拆成核心概念重新检索。涉及中国研究对象或制度情境时，还应使用中文检索工具覆盖 CNKI／万方。

示例（在 dsh 对话中）：

```
搜索 2020 年以后关于 "retrieval augmented generation" 的综述论文，返回 10 篇
```

模型会调用：

```json
{
  "query": "retrieval augmented generation review",
  "yearFrom": 2020,
  "limit": 10
}
```

返回：按相关性排序的文献列表，每篇带 `title`、`authors`、`year`、`venue`、`doi`、`openAccessPdfUrl`（如有）、`oaSources`（命中了哪些源）等字段。

摘要展示保留来源返回的原文，不再额外截为 400 字；来源本身的缺失或截断仍需核实。著录核对可使用 `query=DOI, sources=["crossref"]`：插件访问精确 DOI 端点，返回 `printYear`、`onlineYear`、`volume`、`issue`、`pages`、`articleNumber` 等实际提供的字段。`year` 优先卷期年；缺失字段不推算。不同 DOI 的同名记录保持独立，相同 DOI 的不同平台 ID 合并。

### `chinese_scholar_search` — 中文论文检索

参数为 `query`、`sources`（`cnki`、`wanfang`、`cqvip` 的子集）和 `limit`。CNKI 需要先在 `cnki-mcp` profile 中完成一次登录或机构认证；首次调用可由插件自动启动已配置的 `cnki-mcp` 服务。万方和维普需要 `dsh-browser` 已连接到可操作的普通网页标签页，站点验证码仍需用户手工完成。

首次使用 CNKI 前，在 `cnki-mcp` 目录执行一次 `uv run cnki-mcp init` 完成 profile 初始化；插件不会自动替用户登录或绕过验证码。

### `chinese_scholar_detail` — 中文论文详情

参数只有 `url`。万方和维普由 `dsh-browser` 打开详情页读取，CNKI 交给 `cnki-mcp` 的详情接口。返回 `title`、`authors`、`venue`、`year`、`volume`、`issue`、`pages`、`doi`、`keywords`、`abstract`、`publishDate`、`onlinePublishDate`、`organizations`、`funds`、`classifications`，以及该页面暴露的 `siteDownloadUrl`；缺失字段直接省略，不推算。

`siteDownloadUrl` 只是站点自己的下载入口。它存在不代表当前账号有访问权限，也不代表插件已经取得全文。

### `chinese_scholar_download` — 中文全文下载入口

参数：

- `url` 或 `paper`：二选一。`url` 为 CNKI、万方或维普的详情页地址；`paper` 为 `chinese_scholar_search`／`chinese_scholar_detail` 返回的文献对象，取其详情页。
- `open`（可选，默认 `false`）：默认只解析并报告入口（题名、来源、格式、URL），不打开。核对题录后确认要下载时再传 `open=true`，工具会在已连接的 `dsh-browser` 标签页里打开该入口。

行为与边界：

- 工具只读取详情页上站点自己提供的下载入口，并把它交给用户已登录的浏览器；文件由浏览器保存到自己的下载目录，插件进程不抓取、不落盘、不读取文件内容。
- **PDF 优先，CAJ 单独标明**：候选按格式排序，PDF 在前；页面只提供 CAJ 时 `format` 为 `caj`、`status` 为 `caj-only`，`message` 说明 CAJ 需要 CAJViewer 等专用阅读器、不是 PDF，也不改扩展名冒充 PDF。阅读页（HTML 阅读、原版阅读）不算下载入口，直接排除。
- **打开入口不等于下载完成**：`opened` 只表示已在浏览器打开入口；需要核对浏览器下载列表中的文件名与保存位置，不猜下载目录、不覆盖同名文件。
- 不自动登录、不代过验证码、不绕过订阅或访问控制；页面需要这些前置条件时，如实返回状态而不是尝试突破。
- 返回 `status` 区分五种情况：`opened`（已在新标签页打开）、`link-resolved`（解析到入口但未打开）、`caj-only`（只找到 CAJ 入口）、`no-download-link`（页面没有入口，`message` 说明缺哪一步）、`captcha`（页面出现验证码，需要在浏览器里完成验证后重试）。另带 `downloadUrl`、`format` 和其余候选 `candidates`。
- 维普的抽取规格本身不提供下载入口字段，插件因此不把维普列为可解析站点，通常返回 `no-download-link`；万方的入口取决于机构订阅与按钮渲染；CNKI 的入口通常要求该浏览器已登录机构账号。

确认节奏：先调用一次取回题名、格式与入口，向用户说明后，用户同意再带 `open=true` 重新调用；多篇时一次列出范围统一询问，避免逐篇打断。

下载完成后，用 `scholar_read` 按本地路径读取全文。下载只说明浏览器保存了文件；是否“全文已核”仍需阅读比对。

### `scholar_download` — 下载 PDF

参数：

- `identifier`、`paper`、`papers`：三者必须且只能提供一项。`identifier` 接受 DOI / arXiv ID / PMID；`paper` 为单篇文献对象；`papers` 为 1–50 条文献对象，按标识去重后依次下载。
- `filename`（可选）：单篇自定义文件名，保留中文和 Unicode 字母，清理非法路径字符并补 `.pdf`；同名文件返回 `file-exists`，避免覆盖。
- `downloadDir`（可选）：本次目标目录，可用绝对路径或相对会话工作区路径。省略时使用配置值，默认仍为 `download/papers`。
- `verifyMetadata`（可选，默认 `false`）：通过 Crossref 精确回解 DOI，并比对 `paper` 中的预期标题（允许标点差异和附加副标题）。不符返回 `metadata-mismatch`，未核实返回 `metadata-unverified`，均停止该篇下载。仅传 DOI 时只能核实记录存在，不能判断它是否是用户预期的文章。旧清单和正式著录建议开启此项。

示例：

```
下载 DOI 为 10.48550/arxiv.1706.03762 的论文
```

返回：

- 单篇成功返回 `{ path, source, url, sizeBytes, attempts, pdfVerification, metadata? }`。`pdfVerification` 为 `matched` 时，PDF 首页身份与 DOI 或题名匹配。`unverified` 表示首页证据不足，文件可人工核验。启用并通过 Crossref 著录核对后，还会返回 `metadata`。
- 单篇失败返回 `{ error, triedSources, failureKind?, attempts?, manualLinks?, message? }`。如果发现文献错配且后续副本也未保存，返回 `content-mismatch`。`no-free-fulltext` 表示本次未取得 PDF，可通过 `failureKind` 和 `attempts` 区分无候选、403、验证页及其他失败原因。`manualLinks` 提供可人工打开的文章页和候选地址。
- 批量返回 `{ results: [{ paper, download }], summary: { requested, unique, downloaded, failed, skipped } }`。文本汇总列出保存路径和待补齐条目的题名、DOI、失败原因及最多两个链接。预算用尽或目录故障时保留已完成结果。剩余条目标为 `not-attempted`，批次中断的当前项可返回 `timeout`。

OpenAlex 和 Unpaywall 提供的多个地址会按顺序尝试。机构库落地页支持解析标准 `citation_pdf_url`、bepress 下载入口、DSpace 7 下载路径以及带 PDF 或全文标签的站内 PDF 链接。目标目录会在联网前试写。首页身份核验通过后，可用 `scholar_read` 阅读和核对正文。

### `scholar_scihub_download` — 直接 Sci-Hub 下载

直接通过 Sci-Hub 镜像下载论文，完全绕过 OA fallback 链。并发探测所有配置的镜像，返回第一个可用的 PDF。

默认可用，无需开启灰色渠道开关；`scholar_download` 也会在 OA 来源均未取得全文后，以这些镜像作为最后兜底。

参数：
- `doi`（必需）：论文的 DOI（例如 `"10.1038/nature12373"`）
- `filename`（可选）：自定义文件名

示例：
```
通过 Sci-Hub 下载 DOI 为 10.1038/nature12373 的论文
```

返回：
- 成功：`{ path, url, sizeBytes, mirror }`（保存路径、最终 URL、文件大小、提供下载的镜像）
- 失败：`{ error: 'scihub-not-found', probes: [...] }`（所有镜像都没有；`probes` 列出每个镜像的状态）

> **法律警告**：Sci-Hub 未经出版商授权分发受版权保护的文献。通过它下载**在你所在的司法辖区可能违法**，也可能违反机构政策。此工具仅供了解并接受该风险的用户使用。

### `scholar_read` — 阅读全文

参数：

- `path`（推荐）：已下载 PDF 的本地路径
- 或 `identifier`：先尝试下载再读取
- `maxChars`（可选）：返回文本长度，默认 8000

示例：

```
阅读刚才下载的那篇论文的摘要和引言部分
```

返回：`{ text, pageCount, truncated }`

### 典型工作流

```
你：帮我调研 "retrieval augmented generation" 最近的进展
模型：[调用 scholar_search] 找到 20 篇论文，按相关性和 OA 可用性排序

你：下载前 3 篇
模型：[调用 scholar_download(papers=[前三篇], downloadDir="指定目录")] 返回逐篇状态及自动统计

你：总结第一篇的核心方法
模型：[调用 scholar_read] 提取文本并总结
```

## 配置

所有字段均可选，可在 Web 设置页（Settings → Plugins → Scholar Search）热更新，也可写在 profile 的 `cordis.patch.yml` 里：

| 字段                      | 默认值              | 说明                                                                                      |
| ------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `email`                 | —                  | 礼貌池邮箱。Unpaywall 必填；作为`mailto` 发给 OpenAlex/Crossref 并放进 `User-Agent`。 |
| `semanticScholarApiKey` | —                  | 可选 Semantic Scholar key（无 key 时共享公共限流）。                                      |
| `pubmedApiKey`          | —                  | 可选 NCBI E-utilities key（无 key 3 req/s，有 key 10 req/s）。                            |
| `coreApiKey`            | —                  | 可选 CORE key（免费注册）；无 key 时自动跳过 CORE 源。                                    |
| `googleScholarApiKey`    | —                  | 可选 Google Scholar（SerpAPI）key（付费，免费额度 100 次/月）；无 key 时自动跳过 Google Scholar 源。 |
| `downloadDir`           | `download/papers` | PDF 保存目录（相对 workspace 或绝对路径）。                                               |
| `enabledSources`        | 全部                | 参与检索的源子集。                                                                        |
| `sourceTimeoutMs`       | `15000`           | 单源请求超时（毫秒）。                                                                    |
| `grayAreaMirrors`       | 8 个内置镜像       | 灰色渠道镜像 URL 模板（`{doi}` 占位符），用于最后下载兜底和 Sci-Hub 直接下载。          |
| `browserDownload`        | `false`           | 用真实浏览器（Playwright + 系统 Chrome/Edge）重试被反爬拦截的出版商下载。见下方说明。 |
| `browserExecutablePath`  | —                  | 浏览器可执行文件路径（可选）；缺省自动探测 chrome/msedge 通道。 |
| `chineseSearchEnabled` | `true` | 启用中文论文工具。 |
| `cnkiMcpAutoStart` | `true` | CNKI 查询时自动启动本地 `cnki-mcp`；关闭后只连接已运行服务。 |
| `cnkiMcpEndpoint` | `http://127.0.0.1:7788/mcp` | `cnki-mcp` Streamable HTTP 地址。 |
| `cnkiMcpExecutable` | `uv` | 自动启动使用的可执行文件。 |
| `cnkiMcpProjectDir` | 插件内置 `vendor/cnki-mcp` | `cnki-mcp` 项目目录；可覆盖。 |
| `cnkiMcpStartupTimeoutMs` | `30000` | 等待 `cnki-mcp` 就绪的毫秒数。 |
| `cnkiMcpMinIntervalMs` | `3000` | CNKI 业务调用的最小间隔，低于 1000 毫秒的配置会被拒绝。 |

### 第三方许可证

插件主体使用 MIT 许可证；随包分发的 `vendor/cnki-mcp` 保留其 GPLv3 许可证和源代码。重新分发或修改该组件时必须遵守 GPLv3。


## 下载限制与速率

### 请求频率限制（内置）

插件对每个源强制最小请求间隔（同一源的两次请求之间至少等待这么久），避免触发限流：

| 源 | 默认间隔 | 依据 |
|---|---|---|
| arXiv | 3000 ms | arXiv 官方要求 3 秒 |
| PubMed | 334 ms | NCBI 无 key 时 3 req/s（有 key 10 req/s，可配置 'sourceMinIntervals' 加快） |
| bioRxiv/medRxiv | 500 ms | 无公开限制，保守取值 |
| CORE | 500 ms | 免费 key 有速率限制 |
| Semantic Scholar | 100 ms | 共享公共池（有 key 时独享 1 req/s，可配置加快） |
| OpenAlex / Europe PMC / Crossref / Unpaywall / crossref_page | 100 ms | 礼貌池 |
| DOAJ / OpenAIRE | 200 ms | 无公开限制，保守取值 |
| Google Scholar（SerpAPI） | 1000 ms | 付费 API，保守取值 |
| 灰色渠道 | 1000 ms | 镜像稳定性差 |

可通过配置 'sourceMinIntervals' 覆盖，例如 '{"arxiv": 5000, "pubmed": 100}'。设为 '0' 关闭该源的限流。

### 下载配额与限制

各源的下载配额（免费层）：

- **OpenAlex**：无限制（CC0 数据），礼貌池 10 req/s
- **Semantic Scholar**：无 key 时共享 1000 req/s 公共池（高峰期可能 429）；有 key 独享 1 req/s
- **PubMed**：无 key 3 req/s，有 key 10 req/s；不下载 PDF（只提供元数据，PDF 走 Europe PMC / PMC）
- **Europe PMC**：无限制，PMC OA 子集可下全文
- **arXiv**：无限制，PDF 直链免费
- **bioRxiv/medRxiv**：无限制，预印本 PDF 免费
- **Crossref**：无限制（带 mailto 进礼貌池），但 'link[]' 里的 PDF 多数需订阅（不作为下载源）
- **DOAJ**：无限制，OA 期刊全文免费
- **CORE**：免费 key 有限额（注册页面查看当前额度），OA 仓储 PDF 免费
- **Google Scholar（SerpAPI）**：免费层 100 次搜索/月，付费按量计费；只提供搜索结果，PDF 链接需额外解析
- **Unpaywall**：10 万次/天（需 email），DOI→OA 链接查询
- **OpenAIRE**：无限制，欧洲 OA 聚合
- **灰色渠道（Sci-Hub）**：无官方限制，但镜像不稳定且法律风险自负

插件本身的限制：
- 单源请求超时 15 秒（可配置 'sourceTimeoutMs'）
- 单个 PDF 下载超时 60 秒（可配置 'pdfTimeoutMs'）
- 工具调用总预算 30 秒（可配置 'toolTimeoutMs'）
- 'scholar_read' 默认返回前 8000 字符（可配置 'readMaxChars'）

## 源的合规说明

检索与 OA 补链使用公开学术 API：OpenAlex（CC0 数据）、Semantic Scholar Graph API、NCBI E-utilities、Europe PMC、arXiv API、bioRxiv/medRxiv API、Crossref REST（带 `mailto`）、DOAJ API、CORE API、Unpaywall（要求 email）、OpenAIRE。下载优先尝试 OA 链接，未取得全文时再尝试 Sci-Hub 镜像；来源失败时跳过并继续回退链。

### 灰色渠道与法律风险

灰色渠道默认可用：

1. `scholar_download` 在所有 OA 渠道失败后尝试 Sci-Hub 镜像。
2. `scholar_scihub_download` 可直接查询 Sci-Hub。

`allowGrayArea` 配置项已移除，旧值不再控制下载；镜像能否取得全文取决于网络和论文收录情况。通过此类镜像下载受版权保护的文献**在你所在的司法辖区可能违法**，也可能违反你所在机构的政策与出版商条款。

### 浏览器下载：`browserDownload`

将 `browserDownload` 设为 `true` 后，被反爬拦截（403/cookie 挑战/返回 HTML 伪装 PDF）的出版商下载会用**真实浏览器**重试一次。这对 Wiley、Elsevier、SAGE、Taylor & Francis、MDPI 等有机器人防护的 OA 出版商有效。

- 使用 **Playwright + 系统已安装的 Chrome/Edge**（不下载额外浏览器），headless 模式运行；
- 可用 `browserExecutablePath` 指定浏览器路径，缺省自动探测 chrome/msedge 通道；
- 浏览器重试回退链已解析的 PDF 候选链接，来源顺序仍为 OA 优先、灰色渠道最后兜底；登录与验证由用户完成；
- 首次调用时启动浏览器（约 1-2 秒延迟），之后复用；插件卸载时自动关闭。

浏览器重试遵循与直接下载相同的来源顺序和 PDF 校验。`browserDownload` 配置控制浏览器重试，灰色渠道默认可用。

## 开发

```sh
pnpm install
pnpm run typecheck && pnpm run test && pnpm run build
```

host 端用纯 `tsc` 编译（`tsconfig.build.json` → `lib/`）；browser 端用 `tsdown` 打包（lazy-CJS factory 产物，见 `tsdown.config.ts`），类型声明由 `tsconfig.client-types.json` 生成。

### 快速迭代（可选）

默认 `file:` 安装是硬拷贝，改代码后需重新 build + 重装。如果频繁调试，可改用符号链接 + watch 模式：

```sh
# 1. 建立符号链接（一次性）
cd plugins/self-developed/dsh-scholar-search
npm link
cd ~/.dsh/profiles/web
npm link dsh-scholar-search

# 2. 在 package.json 加 watch 脚本（已实现可跳过）
# "dev": "concurrently \"tsc -p tsconfig.build.json --watch\" \"tsdown --watch\""

# 3. 开发时跑 watch（自动重建 lib/）
pnpm run dev
```

这样改 `src/` 后 `lib/` 自动更新，dsh 的 `patchReload: live`（web profile 已开启）会检测到变化并热重载。

## 故障排查

### 插件加载失败：`The requested module '...' does not provide an export named '...'`

说明插件依赖的 dsh 包版本与实际运行时不匹配。检查：

```sh
# 查看 dsh 实际版本
node "$HOME/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" --version

# 查看插件 peerDependencies
cat plugins/self-developed/dsh-scholar-search/package.json | grep -A 10 peerDependencies
```

如果 dsh 版本低于 peerDependencies 的下限，升级 dsh；如果高于上限（dsh 处于 pre-release，API 可能变动），需要适配插件代码。

### 设置卡片不显示

- 确认 dsh 是 web profile（`dsh --profile web`），headless 模式没有设置页
- 确认 Host 端插件已加载（对话中能看到 `scholar_search` 工具）
- 打开浏览器开发者工具，看 Console 是否有 `dsh-scholar-search` 相关错误

### 搜索返回空结果

- 检查网络连通性：设置卡片里点"测试全部源"，看哪些源不可达
- 某些源（如 CORE）需要 API key，无 key 时自动跳过
- 中文论文使用 `chinese_scholar_search` 检索 CNKI／万方；国际索引可用英文核心概念补查

### 中文下载入口返回 `no-download-link`、`caj-only` 或 `captcha`

`no-download-link` 表示详情页上没读到站点自己的下载入口，不是网络失败。按站点分别排查：

- CNKI：确认受控浏览器里已登录机构账号；`cnki-mcp` 自己的 profile 不能共享给 `dsh-browser`。
- 万方：确认机构订阅有效、页面下载按钮已渲染；没有订阅时按钮本来就不出现。
- 维普：规格里没有下载入口字段，属于预期结果，请在页面手动确认。

`caj-only` 表示页面只给了 CAJ 入口。CAJ 需要 CAJViewer 等专用阅读器，不是 PDF；需要 PDF 时在该页面确认是否另有「PDF下载」，不要改扩展名冒充 PDF。

`captcha` 表示当前标签页出现验证码。在浏览器里完成验证后重试即可，插件不代过验证码。

### 下载失败 `no-free-fulltext`

表示本次回退链未取得有效 PDF。先看 `failureKind` 和 `attempts`：403、挑战页、DNS 和超时分别处理；不能仅凭 403 判断缺少机构网络，浏览器重试也不保证能通过 Cloudflare。可以尝试：

- 配置 `email`（解锁 Unpaywall，覆盖率会提升）
- 检查灰色渠道镜像诊断，或使用 `scholar_scihub_download` 直接查询 Sci-Hub
- 手动从出版商网站下载后放入 `downloadDir`，然后用 `scholar_read` 读取

### `scholar_scihub_download` 失败 `scihub-not-found`

所有配置的镜像都探测过了但都没有这篇论文。返回中的 `probes` 数组显示每个镜像的状态（`found`、`no-pdf-link`、`unreachable`、`bad-url`）。常见原因：
- 该 DOI 不在 Sci-Hub 数据库中（太新或太冷门的论文）
- 所有镜像都被你的网络/ISP 屏蔽
- 镜像页面加载成功但 PDF 链接模式变了（请提 issue 并附上失败的 DOI）

## 许可证

MIT
