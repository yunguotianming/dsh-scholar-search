# dsh-scholar-search

[English](README.md)

[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 的免费学术文献搜索 + 开放获取（OA）全文下载插件。不消耗任何积分——检索全部走免费公开学术 API，下载走"OA 优先、多源 fallback"链。

## 功能

- **`scholar_search`** — 一次查询并行打到最多 10 个源（OpenAlex、Semantic Scholar、PubMed、Europe PMC、arXiv、bioRxiv/medRxiv、Crossref、DOAJ、CORE、Google Scholar），然后按 DOI → arXiv → PMID → canonical URL → 归一化标题 去重合并、按源质量加权排序。已知 OA 直链的结果会带上 `openAccessPdfUrl`。
- **`scholar_download`** — 按 10 级 fallback 链解析免费全文 PDF（OpenAlex locations → Unpaywall → Semantic Scholar → Europe PMC → arXiv/bioRxiv 直链 → OpenAIRE → CORE → 出版商落地页 meta → OA 出版商 URL 模式 → 可选灰色渠道），保存到 `downloadDir`。
- **`scholar_scihub_download`** — 直接通过 Sci-Hub 下载，完全绕过 OA fallback 链。并发探测所有配置的镜像，返回第一个可用的 PDF。需要启用 `allowGrayArea`。请确保你了解所在司法辖区的法律风险后再使用。
- **`scholar_read`** — 需要时先下载，再用 `pdf-parse` 抽取 PDF 文本，分片返回。
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

## 使用方法

### `scholar_search` — 搜索文献

参数：

- `query`（必需）：搜索关键词（英文效果最好；中文查询建议先让模型翻译成英文）
- `sources`（可选）：指定源子集，默认全部启用
- `limit`（可选）：返回结果数，默认 20
- `yearFrom` / `yearTo`（可选）：年份过滤

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

### `scholar_download` — 下载 PDF

参数：

- `identifier`（必需）：DOI / arXiv ID / PMID / 论文标题（会从最近的搜索结果中匹配）
- `filename`（可选）：自定义文件名

示例：

```
下载 DOI 为 10.48550/arxiv.1706.03762 的论文
```

返回：

- 成功：`{ path, source, url, sizeBytes }`（保存路径、命中的源、最终 URL、文件大小）
- 失败：`{ error: 'no-free-fulltext', triedSources: [...] }`（所有 OA 渠道都没有这篇的免费全文）

### `scholar_scihub_download` — 直接 Sci-Hub 下载

直接通过 Sci-Hub 镜像下载论文，完全绕过 OA fallback 链。并发探测所有配置的镜像，返回第一个可用的 PDF。

**需要在 Settings → Plugins → Scholar Search 中启用 `allowGrayArea`**。

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
- 未启用：`{ error: 'scihub-disabled' }`

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
模型：[调用 scholar_download × 3] 保存到 papers/ 目录

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
| `allowGrayArea`         | `false`           | 启用灰色渠道（Sci-Hub 镜像）作为 `scholar_download` 最后的下载 fallback，并解锁 `scholar_scihub_download` 工具。见下方法律警告。 |
| `downloadDir`           | `download/papers` | PDF 保存目录（相对 workspace 或绝对路径）。                                               |
| `enabledSources`        | 全部                | 参与检索的源子集。                                                                        |
| `sourceTimeoutMs`       | `15000`           | 单源请求超时（毫秒）。                                                                    |
| `grayAreaMirrors`       | 8 个内置镜像       | 灰色渠道镜像 URL 模板（`{doi}` 占位符）；仅 `allowGrayArea` 为 true 时使用。          |
| `browserDownload`        | `false`           | 用真实浏览器（Playwright + 系统 Chrome/Edge）重试被反爬拦截的出版商下载。见下方说明。 |
| `browserExecutablePath`  | —                  | 浏览器可执行文件路径（可选）；缺省自动探测 chrome/msedge 通道。 |


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

所有检索源均为免费公开 API，并在其公开条款内使用：OpenAlex（CC0 数据）、Semantic Scholar Graph API、NCBI E-utilities、Europe PMC、arXiv API、bioRxiv/medRxiv API、Crossref REST（带 `mailto`）、DOAJ API、CORE API、Unpaywall（要求 email）、OpenAIRE。PDF 下载只抓取各源自己公开发布的 OA 链接；整条链不绕过任何付费墙，401/403/429/超时一律降级为跳过该源而不是报错。

### 法律警告：`allowGrayArea`

将 `allowGrayArea` 设为 `true` 会做两件事：
1. 把 Sci-Hub 镜像加入 `scholar_download` fallback 链的末尾（第 10 级，所有 OA 渠道失败后才尝试）。
2. 解锁 `scholar_scihub_download` 工具，可直接查询 Sci-Hub。

通过此类镜像下载受版权保护的文献**在你所在的司法辖区可能违法**，也可能违反你所在机构的政策与出版商条款。该选项默认关闭；开启即表示你自行承担全部风险。

### 浏览器下载：`browserDownload`

将 `browserDownload` 设为 `true` 后，被反爬拦截（403/cookie 挑战/返回 HTML 伪装 PDF）的出版商下载会用**真实浏览器**重试一次。这对 Wiley、Elsevier、SAGE、Taylor & Francis、MDPI 等有机器人防护的 OA 出版商有效。

- 使用 **Playwright + 系统已安装的 Chrome/Edge**（不下载额外浏览器），headless 模式运行；
- 可用 `browserExecutablePath` 指定浏览器路径，缺省自动探测 chrome/msedge 通道；
- 浏览器只用于下载**已知为 OA 的 PDF 链接**（fallback 链已经确认的合法 OA 地址），不绕过付费墙——它解决的是"出版商反爬拦截程序化下载"，不是"访问需要订阅的内容"；
- 首次调用时启动浏览器（约 1-2 秒延迟），之后复用；插件卸载时自动关闭。

**合规说明**：浏览器下载仍只访问 fallback 链确认的合法 OA 链接，与直接 `fetch` 的区别仅在于用真实浏览器渲染以通过反爬检测，不改变"只下载合法开放获取内容"的原则。

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
- 中文查询效果差，先让模型翻译成英文再搜

### 下载失败 `no-free-fulltext`

说明所有 OA 渠道都没有这篇论文的免费全文。可以尝试：

- 配置 `email`（解锁 Unpaywall，覆盖率会提升）
- 开启 `allowGrayArea`（自行承担法律风险）后重试，或使用 `scholar_scihub_download` 直接查询 Sci-Hub
- 手动从出版商网站下载后放入 `downloadDir`，然后用 `scholar_read` 读取

### `scholar_scihub_download` 失败 `scihub-not-found`

所有配置的镜像都探测过了但都没有这篇论文。返回中的 `probes` 数组显示每个镜像的状态（`found`、`no-pdf-link`、`unreachable`、`bad-url`）。常见原因：
- 该 DOI 不在 Sci-Hub 数据库中（太新或太冷门的论文）
- 所有镜像都被你的网络/ISP 屏蔽
- 镜像页面加载成功但 PDF 链接模式变了（请提 issue 并附上失败的 DOI）

## 许可证

MIT
