# dsh-scholar-search

[中文](README_CN.md)

Current version: **0.3.1**. Extends 0.2.1 (destination write checks, Unicode filenames, lazy download fallbacks, DOI metadata verification, deduplication fixes, computed batch counts) with fuller Chinese record fields and a Chinese full-text download-entry tool (PDF/CAJ format split, resolve-then-open), and syncs the bundled `cnki-mcp` to upstream 0.2.0.

Free academic literature search + open-access full-text download for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness). No paid API, no credits — all retrieval goes through free public scholarly APIs, and downloads follow an "OA first, multi-source fallback" chain.

## Features

- **`scholar_search`** — one query fans out to up to 10 sources (OpenAlex, Semantic Scholar, PubMed, Europe PMC, arXiv, bioRxiv/medRxiv, Crossref, DOAJ, CORE, Google Scholar), then dedupes (DOI → arXiv → PMID → canonical URL → normalized title), merges, and quality-ranks the results. Every hit carries an `openAccessPdfUrl` when one is known.
- **`scholar_download`** — tries Europe PMC first, follows alternate open-access locations, and checks the PDF's identity before saving. Supports per-call directories, Unicode filenames, deduplicated batches, and links for manual retrieval.
- **`scholar_scihub_download`** — direct Sci-Hub download, bypassing the OA chain entirely. Concurrently probes all configured mirrors and returns the first available PDF. Available by default. Use only when you understand the legal risk in your jurisdiction.
- **`scholar_read`** — downloads (when needed) and extracts PDF text with `pdf-parse`, returned in slices.
- **`chinese_scholar_search` / `chinese_scholar_detail` / `chinese_scholar_download`** — search CNKI, Wanfang, and CQVIP; read DOI, publication dates, organizations, funds, and classifications; and hand the site's own full-text download entry to the user's browser. CNKI uses a local `cnki-mcp` service (optionally started on demand); Wanfang and CQVIP use the connected `dsh-browser`.
- A Web settings card (Settings → Plugins) with a config summary and per-source connectivity checks (including per-mirror Sci-Hub reachability).

## Install

### Prerequisites

- dsh ≥ 0.1.0-rc.6 (verified on 0.1.2-alpha.2)
- Node.js ≥ 22.19

### From npm (once published)

```sh
dsh plugin --profile web add dsh-scholar-search
```

### From local source (development / current)

```sh
# 1. Build the plugin
cd E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search
pnpm install
pnpm run build

# 2. Install into the dsh web profile
dsh plugin --profile web add "file:E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search"
```

> **Note**: when `dsh` is not on your PATH, invoke it by full path:
> ```sh
> node "$HOME/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web add "file:..."
> ```

After install the plugin:
- appears at `~/.dsh/profiles/web/node_modules/dsh-scholar-search/` (a **hard copy** under the `file:` protocol, not a symlink),
- is appended to the profile manifest's `dsh.profile.bundles` list,
- is loaded automatically the next time dsh web starts.

The package includes the `vendor/cnki-mcp` source, `pyproject.toml`, and its GPLv3 license, so users do not need to download the `cnki-mcp` repository separately. Python 3.11+, `uv`, and a Playwright browser runtime are still required on the host. The plugin only lets `uv` install Python dependencies; it never automates login or downloads restricted full text.

## Enable and verify

**Restart dsh web** after installing:

```sh
dsh --profile web
```

Verify the plugin loaded:

1. **Tool catalog**: in a dsh Web conversation, ask it to "search for papers" — the model should see the `scholar_search` tool.
2. **Settings card**: open Settings → Plugins; a "Scholar Search" card should appear with a config summary and per-source connectivity buttons.
3. **Manual test**: ask the model to run `scholar_search`, e.g.
   ```
   Use scholar_search to search for "attention is all you need"
   ```

## Updating the plugin (local-source workflow)

Because a `file:` dependency is a hard copy, after editing the source you must rebuild and **reinstall manually** (`dsh plugin update` does not re-copy `file:` dependencies):

```sh
# 1. Rebuild
cd E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search
pnpm run build

# 2. Remove the old copy
dsh plugin --profile web remove dsh-scholar-search

# 3. Reinstall
dsh plugin --profile web add "file:E:/project-workspace/ai-projects/deepseek-harness/plugins/self-developed/dsh-scholar-search"

# 4. Restart dsh web
```

> **Tip**: for rapid iteration, switch to `npm link` + watch mode instead — see the Development section below.

## Remove the plugin

```sh
dsh plugin --profile web remove dsh-scholar-search
```

After removal:
- the package is deleted from `~/.dsh/profiles/web/node_modules/`,
- the bundle row is removed from the profile manifest,
- the plugin's tools and settings card disappear after the next restart.

Downloaded PDFs (in `downloadDir`, default `<workspace>/download/papers/`) are **not** deleted.

## MCP

Connect an MCP client over local stdio to search academic indexes, look up an exact DOI, and locate open-access full-text candidates. From a source checkout, install dependencies and run `pnpm run build:lib`. Set the client command to `node` and pass the absolute path to `lib/mcp/stdio.js` as its argument. The package also declares a `dsh-scholar-mcp` executable.

The tools are `scholar_search` (`query`, optional `sources`, `limit`, `yearFrom`, `yearTo`), `scholar_lookup_doi` (`doi`), and `scholar_locate_open_access` (`identifier`, a DOI, arXiv ID, or PMID). CNKI search is available through `chinese_scholar_search` (`query`, optional `limit`) and `chinese_scholar_detail` (`url` from a search result). They use the bundled `cnki-mcp` service and its initialized browser profile. Set `SCHOLAR_EMAIL` in the client environment to enable Unpaywall. See the [Windows configuration example and source credentials](README_CN.md#mcp-接入) and the [CNKI setup](README_CN.md#初始化知网).

Use `chinese_scholar_download` with a CNKI, Wanfang, or CQVIP article detail `url` and an absolute `downloadDir` on the MCP host. The first call returns the proposed destination and a single-use `confirmationId`. Show the article and directory to the user, wait for explicit approval, then call again with the same arguments and the ID. The tool saves the PDF or CAJ through a dedicated Chrome or Edge profile and returns the file path. See [Chinese full-text downloads](README_CN.md#下载中文全文文件).

## Usage

### `scholar_search` — search the literature

Parameters:
- `query` (required): search keywords (English works best; ask the model to translate Chinese queries first)
- `sources` (optional): subset of sources; defaults to all enabled
- `limit` (optional): number of results, default 20
- `yearFrom` / `yearTo` (optional): year filter

Example (in a dsh conversation):
```
Search for review papers on "retrieval augmented generation" published after 2020, return 10
```

The model calls:
```json
{
  "query": "retrieval augmented generation review",
  "yearFrom": 2020,
  "limit": 10
}
```

Returns: a relevance-ranked list of papers, each with `title`, `authors`, `year`, `venue`, `doi`, `openAccessPdfUrl` (when known), `oaSources` (which sources surfaced it), etc. Abstracts are displayed without the previous 400-character cut; upstream completeness still needs checking.

Select sources for the research question; hyphenated aliases such as `semantic-scholar` are accepted. Unknown or entirely disabled sources produce an explicit error. Split long queries when recall is low. For Chinese research contexts, supplement international indexes with CNKI/Wanfang using the Chinese tools.

Use `query=DOI, sources=["crossref"]` for an exact DOI lookup. Available metadata includes `printYear`, `onlineYear`, `volume`, `issue`, `pages`, and `articleNumber`; `year` prefers the print year and missing fields stay absent. Matching DOI records merge across platform IDs; matching titles with conflicting identifiers remain separate.

### `chinese_scholar_search` — Chinese literature

Use `query`, an optional `sources` subset (`cnki`, `wanfang`, `cqvip`), and `limit`. CNKI requires one-time login or institutional authentication in a `cnki-mcp` profile. Wanfang and CQVIP require a connected `dsh-browser` tab; site verification remains a manual user action.

Before the first CNKI call, run `uv run cnki-mcp init` once in the `cnki-mcp` checkout to initialize a profile. The plugin never automates login or bypasses verification.

### `chinese_scholar_detail` — Chinese record details

Takes `url` only. Wanfang and CQVIP are read through `dsh-browser`; CNKI is delegated to `cnki-mcp`. Returns `title`, `authors`, `venue`, `year`, `volume`, `issue`, `pages`, `doi`, `keywords`, `abstract`, `publishDate`, `onlinePublishDate`, `organizations`, `funds`, `classifications`, and the page's `siteDownloadUrl`. Missing fields stay absent and are never inferred.

`siteDownloadUrl` is only the site's own download entry. It does not mean the current account is entitled, and it does not mean the plugin holds the full text.

### `chinese_scholar_download` — Chinese full-text download entry

Parameters:
- `url` or `paper`: exactly one. `url` is a CNKI, Wanfang, or CQVIP detail page; `paper` is a record from `chinese_scholar_search`/`chinese_scholar_detail`, whose detail page is used.
- `open` (optional, default `false`): resolve and report only (title, entry URL, format). Pass `open=true` after the user confirms, and the tool opens the entry in the connected `dsh-browser` tab.

Behaviour and boundaries:
- The tool reads only the download entry the site itself publishes on the detail page and hands it to the user's logged-in browser. The browser saves the file to its own download directory; the plugin process never fetches, writes, or reads the file.
- **PDF first, CAJ stated separately**: candidates rank PDF ahead of CAJ. When the page offers only CAJ, `format` is `caj` and `status` is `caj-only`; `message` says CAJ needs a dedicated reader such as CAJViewer, is not a PDF, and must not be renamed to one. Reader pages (HTML reading, original-version reading) are not download entries and are excluded.
- **An opened entry is not a completed download**: `opened` only means the entry was opened in the browser. Check the browser's download list for the filename and save location; never guess the download directory or overwrite an existing file.
- No automated login, no captcha solving, no subscription or access-control bypass. When the page needs any of these, the tool reports the status instead of attempting a workaround.
- `status` is one of `opened` (opened in a new tab), `link-resolved` (resolved, not opened), `caj-only` (only a CAJ entry exists), `no-download-link` (no entry on the page; `message` names the missing step), or `captcha` (complete verification in the browser and retry). The result also carries `downloadUrl`, `format`, and any further `candidates`.
- CQVIP's extraction spec does not provide a download-entry field, so the plugin does not treat CQVIP as resolvable and normally returns `no-download-link`. Wanfang entries depend on institutional subscription and button rendering; CNKI entries normally require an institutional login in that same browser.

Confirmation flow: call once to get the title, format, and entry; report them to the user; call again with `open=true` after approval. For multiple papers, list the range once and ask together instead of interrupting per paper.

After the browser saves the file, read it with `scholar_read` by local path. A download only proves a file was saved; a verified reading still requires comparing the text.

### `scholar_download` — download a PDF

Parameters:
- Exactly one of `identifier` (DOI / arXiv ID / PMID), `paper` (one search result), or `papers` (1–50 records, deduplicated before sequential downloads).
- `filename` (optional): single-paper filename; Unicode letters are preserved and unsafe path characters are cleaned. Existing files return `file-exists` and are not overwritten.
- `downloadDir` (optional): per-call absolute directory or path relative to the session workspace. Omitting it keeps the configured default (`download/papers`).
- `verifyMetadata` (optional, default `false`): resolve the DOI through Crossref and compare the expected `paper.title`, allowing punctuation differences and added subtitles. A mismatch or unavailable verification stops that paper with `metadata-mismatch` or `metadata-unverified`. A bare DOI can verify a registry record but cannot establish the intended article. Recommended for old bibliographies and citation checks.

Example:
```
Download the paper with DOI 10.48550/arxiv.1706.03762
```

Returns:
- Success returns `{ path, source, url, sizeBytes, attempts, pdfVerification, metadata? }`. `matched` indicates that the PDF's identity matched the DOI or title. `unverified` marks saved files that need manual review. Crossref metadata is included when explicitly verified.
- Failure returns `{ error, triedSources, failureKind?, attempts?, manualLinks?, message? }`. `content-mismatch` reports a conflicting PDF when no later candidate was saved. When a download returns `no-free-fulltext`, consult the attempt details for the source, URL, and any HTTP status. `manualLinks` gives readers article pages and candidate links for manual retrieval.
- Batch returns `{ results: [{ paper, download }], summary: { requested, unique, downloaded, failed, skipped } }`. The text summary lists saved paths and papers needing manual retrieval, with the reason and up to two links per paper. Time budgets or directory failures preserve completed results and mark remaining items `not-attempted`. The interrupted item may report `timeout`.

OpenAlex and Unpaywall candidates are tried in order. Landing-page discovery supports `citation_pdf_url`, bepress download routes, DSpace 7 downloads, and same-site PDF links labeled as downloads or full text. The destination is write-probed before network requests. Use `scholar_read` to read the full paper after the identity check.

### `scholar_scihub_download` — direct Sci-Hub download

Downloads a paper directly through Sci-Hub mirrors, bypassing the OA fallback chain entirely. Concurrently probes all configured mirrors and returns the first available PDF.

Available by default; no gray-area toggle is required. `scholar_download` also uses these mirrors as its final fallback after OA sources.

Parameters:
- `doi` (required): the paper's DOI (e.g. `"10.1038/nature12373"`)
- `filename` (optional): custom filename

Example:
```
Download DOI 10.1038/nature12373 via Sci-Hub
```

Returns:
- on success: `{ path, url, sizeBytes, mirror }` (saved path, final URL, file size, which mirror provided it)
- on failure: `{ error: 'scihub-not-found', probes: [...] }` (no mirror has it; `probes` lists each mirror's status)

> **Legal warning**: Sci-Hub distributes copyrighted literature without publisher authorization. Downloading through it **may be illegal in your jurisdiction** and may violate institutional policies. This tool is provided for users who understand and accept that risk.

### `scholar_read` — read the full text

Parameters:
- `path` (preferred): local path of a downloaded PDF
- or `identifier`: download first, then read
- `maxChars` (optional): text length to return, default 8000

Example:
```
Read the abstract and introduction of the paper I just downloaded
```

Returns: `{ text, pageCount, truncated }`

### Typical workflow

```
You: Help me survey recent progress on "retrieval augmented generation"
Model: [calls scholar_search] finds 20 papers, ranked by relevance and OA availability

You: Download the first 3
Model: [calls scholar_download with papers and downloadDir] returns per-paper results and computed counts

You: Summarize the core method of the first one
Model: [calls scholar_read] extracts the text and summarizes
```

## Configuration

Every field is optional and hot-updatable from the Web settings page (Settings → Plugins → Scholar Search), or via the profile's `cordis.patch.yml`:

| Field | Default | Description |
|---|---|---|
| `email` | — | Polite-pool email. Required by Unpaywall; sent as `mailto` to OpenAlex/Crossref and in the `User-Agent`. |
| `semanticScholarApiKey` | — | Optional Semantic Scholar key (without one you share the public rate limit). |
| `pubmedApiKey` | — | Optional NCBI E-utilities key (3 req/s without, 10 req/s with). |
| `coreApiKey` | — | Optional CORE key (free registration); the CORE source is skipped without it. |
| `googleScholarApiKey` | — | Optional Google Scholar (SerpAPI) key (paid, free tier 100/month); the Google Scholar source is skipped without it. |
| `downloadDir` | `download/papers` | Directory PDFs download into (relative to the workspace, or absolute). |
| `enabledSources` | all | Subset of search sources participating in `scholar_search`. |
| `sourceTimeoutMs` | `15000` | Per-source request timeout (ms). |
| `grayAreaMirrors` | 8 built-in mirrors | Gray-area mirror URL templates (`{doi}` placeholder), used for the final download fallback and direct Sci-Hub downloads. |
| `chineseSearchEnabled` | `true` | Enable the Chinese paper tools. |
| `cnkiMcpAutoStart` | `true` | Start local `cnki-mcp` on the first CNKI call; when false, only an existing service is used. |
| `cnkiMcpEndpoint` | `http://127.0.0.1:7788/mcp` | `cnki-mcp` Streamable HTTP endpoint. |
| `cnkiMcpExecutable` | `uv` | Executable used for automatic startup. |
| `cnkiMcpProjectDir` | bundled `vendor/cnki-mcp` | `cnki-mcp` checkout directory used for automatic startup. |
| `cnkiMcpStartupTimeoutMs` | `30000` | Startup readiness timeout in milliseconds. |
| `cnkiMcpMinIntervalMs` | `3000` | Minimum interval between CNKI business calls; values below 1000 ms are rejected. |

### Third-party license

The plugin code is MIT-licensed. The bundled `vendor/cnki-mcp` component retains its GPLv3 license and source; redistribution or modification of that component must comply with GPLv3.


## Download limits and rate limiting

### Request rate limiting (built-in)

The plugin enforces a minimum interval between successive requests to each source, to avoid tripping rate limits:

| Source | Default interval | Basis |
|---|---|---|
| arXiv | 3000 ms | arXiv officially asks for 3 seconds |
| PubMed | 334 ms | NCBI: 3 req/s without a key (10 req/s with one; configure 'sourceMinIntervals' to speed up) |
| bioRxiv/medRxiv | 500 ms | No published limit; conservative |
| CORE | 500 ms | Free keys are rate-limited |
| Semantic Scholar | 100 ms | Shared public pool (1 req/s dedicated with a key; configure to speed up) |
| OpenAlex / Europe PMC / Crossref / Unpaywall / crossref_page | 100 ms | Polite pool |
| DOAJ / OpenAIRE | 200 ms | No published limit; conservative |
| Google Scholar (SerpAPI) | 1000 ms | Paid API; conservative |
| Gray area | 1000 ms | Mirrors are unstable |

Override via the 'sourceMinIntervals' config, e.g. '{"arxiv": 5000, "pubmed": 100}'. Set '0' to disable throttling for a source.

### Download quotas and limits

Free-tier quotas per source:

- **OpenAlex**: unlimited (CC0 data), polite pool 10 req/s
- **Semantic Scholar**: shared 1000 req/s public pool without a key (may 429 at peak); 1 req/s dedicated with a key
- **PubMed**: 3 req/s without a key, 10 req/s with; no PDF downloads (metadata only — PDFs come via Europe PMC / PMC)
- **Europe PMC**: unlimited; PMC OA subset offers full text
- **arXiv**: unlimited, free PDF direct links
- **bioRxiv/medRxiv**: unlimited, free preprint PDFs
- **Crossref**: unlimited (mailto gets you into the polite pool), but 'link[]' PDFs mostly need a subscription (not used as a download source)
- **DOAJ**: unlimited, free OA journal full text
- **CORE**: free key has a quota (see the registration page), free OA repository PDFs
- **Google Scholar (SerpAPI)**: free tier 100 searches/month, paid by volume; search results only, PDF links need extra parsing
- **Unpaywall**: 100k requests/day (requires email), DOI→OA link lookup
- **OpenAIRE**: unlimited, European OA aggregator
- **Gray area (Sci-Hub)**: no official limit, but mirrors are unstable and the legal risk is yours

Plugin-internal limits:
- 15s per-source request timeout ('sourceTimeoutMs')
- 60s per-PDF download timeout ('pdfTimeoutMs')
- 30s total tool-call budget ('toolTimeoutMs')
- 'scholar_read' returns the first 8000 characters by default ('readMaxChars')

## Source compliance

Search and OA link retrieval use public scholarly APIs: OpenAlex (CC0 data), Semantic Scholar Graph API, NCBI E-utilities, Europe PMC, arXiv API, bioRxiv/medRxiv API, Crossref REST (with `mailto`), DOAJ API, CORE API, Unpaywall (requires email), OpenAIRE. Downloads try OA links first, then use Sci-Hub mirrors as the final fallback. Failed sources are skipped so the chain can continue.

### Gray-area channels and legal risk

Gray-area channels are available by default:
1. `scholar_download` tries Sci-Hub mirrors after all OA channels fail.
2. `scholar_scihub_download` queries Sci-Hub directly.

The `allowGrayArea` setting has been removed; legacy values no longer control downloads. Mirror availability depends on the network and the paper. Downloading copyrighted literature through such mirrors **may be illegal in your jurisdiction** and may violate your institution's policies and publisher terms.

### Browser download: `browserDownload`

Setting `browserDownload` to `true` retries publisher downloads that were blocked by anti-bot measures (403 / cookie challenge / HTML masquerading as a PDF) once through a **real browser**. This works for OA publishers with bot protection such as Wiley, Elsevier, SAGE, Taylor & Francis, and MDPI.

- Uses **Playwright + the system-installed Chrome/Edge** (no extra browser download), running headless;
- set `browserExecutablePath` to a specific browser binary, or leave it to auto-probe the chrome/msedge channels;
- the browser retries PDF candidate links resolved by the fallback chain, which tries OA sources before gray-area mirrors; login and verification remain manual;
- the browser launches on first use (~1–2s), is reused afterwards, and closes automatically on plugin unload.

Browser retries follow the same source order and PDF validation as direct downloads. The `browserDownload` setting controls browser retries; gray-area channels are available by default.

## Development

```sh
pnpm install
pnpm run typecheck && pnpm run test && pnpm run build
```

The host half compiles with plain `tsc` (`tsconfig.build.json` → `lib/`); the browser half bundles with `tsdown` (lazy-CJS factory artifact, see `tsdown.config.ts`), with type declarations generated by `tsconfig.client-types.json`.

### Rapid iteration (optional)

The default `file:` install is a hard copy — after editing you must rebuild and reinstall. For frequent debugging, switch to a symlink + watch mode:

```sh
# 1. Set up the symlink (once)
cd plugins/self-developed/dsh-scholar-search
npm link
cd ~/.dsh/profiles/web
npm link dsh-scholar-search

# 2. Add a watch script to package.json (if not already present)
# "dev": "concurrently \"tsc -p tsconfig.build.json --watch\" \"tsdown --watch\""

# 3. Run watch while developing (auto-rebuilds lib/)
pnpm run dev
```

Now editing `src/` auto-updates `lib/`, and dsh's `patchReload: live` (enabled on the web profile) detects the change and hot-reloads.

## Troubleshooting

### Plugin fails to load: `The requested module '...' does not provide an export named '...'`

The plugin's dsh package versions don't match the runtime. Check:
```sh
# The actual dsh version
node "$HOME/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" --version

# The plugin's peerDependencies
cat plugins/self-developed/dsh-scholar-search/package.json | grep -A 10 peerDependencies
```

If dsh is below the peer floor, upgrade dsh; if it's above the ceiling (dsh is pre-release and APIs shift), the plugin code needs adapting.

### The settings card doesn't appear

- Confirm dsh is the web profile (`dsh --profile web`); headless mode has no settings page.
- Confirm the Host half loaded (the `scholar_search` tool is visible in a conversation).
- Open the browser dev tools and look for `dsh-scholar-search` errors in the Console.

### Search returns empty results

- Check connectivity: click "test all sources" in the settings card to see which sources are unreachable.
- Some sources (e.g. CORE) need an API key and are skipped without one.
- Use `chinese_scholar_search` for CNKI/Wanfang; English core concepts can supplement international-index searches.

### Chinese download entry returns `no-download-link`, `caj-only`, or `captcha`

`no-download-link` means no site-published download entry was read on the detail page; it is not a network failure. Check per site:

- CNKI: confirm the controlled browser is logged in with an institutional account. A `cnki-mcp` profile is not shared with `dsh-browser`.
- Wanfang: confirm the institutional subscription is active and the download button rendered; without entitlement the button does not appear.
- CQVIP: the extraction spec has no download field, so this is the expected result; confirm manually on the page.

`caj-only` means the page offers only a CAJ entry. CAJ needs a dedicated reader such as CAJViewer and is not a PDF; check the page for a separate PDF entry rather than renaming CAJ to PDF.

`captcha` means the current tab shows a verification page. Complete it in the browser and retry; the plugin never solves it.

### Download fails with `no-free-fulltext`

No PDF was obtained in this attempt. Inspect `failureKind` and `attempts` for HTTP errors, challenge pages, DNS failures, or timeouts. A 403 alone does not establish missing institutional access, and browser retries do not guarantee Cloudflare access. You can:
- Configure `email` (unlocks Unpaywall, improving coverage),
- Inspect gray-area mirror diagnostics, or use `scholar_scihub_download` to query Sci-Hub directly,
- Download manually from the publisher into `downloadDir`, then use `scholar_read`.

### `scholar_scihub_download` fails with `scihub-not-found`

All configured mirrors were probed but none had the paper. The `probes` array in the response shows each mirror's status (`found`, `no-pdf-link`, `unreachable`, `bad-url`). Common causes:
- The DOI is not in Sci-Hub's database (very recent or obscure papers),
- All mirrors are blocked by your network/ISP,
- The mirror page loaded but the PDF link pattern changed (open an issue with the failing DOI).

## Acknowledgements

- [dsh-ai4scholar](https://github.com/literaf/dsh-ai4scholar) (MIT) — Cordis plugin structure, the client settings-card pattern, the publisher PDF URL pattern table, and the arXiv/bioRxiv adapter skeletons.
- QwenPaw `local_paper_hub` — the dedupe-key design, source-quality weights, OpenAlex abstract rebuilding, and OA link-enrichment degradation conventions (logic borrowed, reimplemented in TypeScript).

## License

MIT
