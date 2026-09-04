# dsh-scholar-search

[中文](README_CN.md)

Free academic literature search + open-access full-text download for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness). No paid API, no credits — all retrieval goes through free public scholarly APIs, and downloads follow an "OA first, multi-source fallback" chain.

## Features

- **`scholar_search`** — one query fans out to up to 10 sources (OpenAlex, Semantic Scholar, PubMed, Europe PMC, arXiv, bioRxiv/medRxiv, Crossref, DOAJ, CORE, Google Scholar), then dedupes (DOI → arXiv → PMID → canonical URL → normalized title), merges, and quality-ranks the results. Every hit carries an `openAccessPdfUrl` when one is known.
- **`scholar_download`** — resolves a free full-text PDF through a 10-level fallback chain (OpenAlex locations → Unpaywall → Semantic Scholar → Europe PMC → arXiv/bioRxiv direct links → OpenAIRE → CORE → publisher landing-page meta → OA publisher URL patterns → optional gray area) and saves it to `downloadDir`.
- **`scholar_scihub_download`** — direct Sci-Hub download, bypassing the OA chain entirely. Concurrently probes all configured mirrors and returns the first available PDF. Requires `allowGrayArea` to be enabled. Use only when you understand the legal risk in your jurisdiction.
- **`scholar_read`** — downloads (when needed) and extracts PDF text with `pdf-parse`, returned in slices.
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

Returns: a relevance-ranked list of papers, each with `title`, `authors`, `year`, `venue`, `doi`, `openAccessPdfUrl` (when known), `oaSources` (which sources surfaced it), etc.

### `scholar_download` — download a PDF

Parameters:
- `identifier` (required): DOI / arXiv ID / PMID / paper title (matched against recent search results)
- `filename` (optional): custom filename

Example:
```
Download the paper with DOI 10.48550/arxiv.1706.03762
```

Returns:
- on success: `{ path, source, url, sizeBytes }` (saved path, the source that yielded it, final URL, file size)
- on failure: `{ error: 'no-free-fulltext', triedSources: [...] }` (no OA channel has a free full text)

### `scholar_scihub_download` — direct Sci-Hub download

Downloads a paper directly through Sci-Hub mirrors, bypassing the OA fallback chain entirely. Concurrently probes all configured mirrors and returns the first available PDF.

**Requires `allowGrayArea` to be enabled** in Settings → Plugins → Scholar Search.

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
- when disabled: `{ error: 'scihub-disabled' }`

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
Model: [calls scholar_download × 3] saves them to papers/

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
| `allowGrayArea` | `false` | Enable gray-area mirrors (Sci-Hub) as the LAST download fallback in `scholar_download`, and unlock `scholar_scihub_download`. See the legal warning below. |
| `downloadDir` | `download/papers` | Directory PDFs download into (relative to the workspace, or absolute). |
| `enabledSources` | all | Subset of search sources participating in `scholar_search`. |
| `sourceTimeoutMs` | `15000` | Per-source request timeout (ms). |
| `grayAreaMirrors` | 8 built-in mirrors | Gray-area mirror URL templates (`{doi}` placeholder); only used when `allowGrayArea` is true. |


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

Every retrieval source is a free public API used within its published terms: OpenAlex (CC0 data), Semantic Scholar Graph API, NCBI E-utilities, Europe PMC, arXiv API, bioRxiv/medRxiv API, Crossref REST (with `mailto`), DOAJ API, CORE API, Unpaywall (requires email), OpenAIRE. PDF downloads only fetch OA links the sources themselves publish; the chain never bypasses a paywall, and 401/403/429/timeout always degrades to "skip this source" rather than erroring.

### Legal warning: `allowGrayArea`

Setting `allowGrayArea` to `true` does two things:
1. Appends Sci-Hub mirrors to the end of the `scholar_download` fallback chain (level 10, after all OA channels fail).
2. Unlocks the `scholar_scihub_download` tool for direct Sci-Hub queries.

Downloading copyrighted literature through such mirrors **may be illegal in your jurisdiction** and may violate your institution's policies and publisher terms. The option is off by default; enabling it means you bear all risk.

### Browser download: `browserDownload`

Setting `browserDownload` to `true` retries publisher downloads that were blocked by anti-bot measures (403 / cookie challenge / HTML masquerading as a PDF) once through a **real browser**. This works for OA publishers with bot protection such as Wiley, Elsevier, SAGE, Taylor & Francis, and MDPI.

- Uses **Playwright + the system-installed Chrome/Edge** (no extra browser download), running headless;
- set `browserExecutablePath` to a specific browser binary, or leave it to auto-probe the chrome/msedge channels;
- the browser is only used to download **PDF links already confirmed as OA** by the fallback chain — it does not bypass paywalls. It solves "the publisher's bot protection blocked a programmatic download", not "access subscription content";
- the browser launches on first use (~1–2s), is reused afterwards, and closes automatically on plugin unload.

**Compliance**: browser download still only touches the legal OA links the chain already confirmed; the only difference from a direct `fetch` is that a real browser renders the page to pass anti-bot checks. The principle of "only download legitimately open-access content" is unchanged.

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
- Chinese queries perform poorly; ask the model to translate to English first.

### Download fails with `no-free-fulltext`

No OA channel has a free full text for this paper. You can:
- Configure `email` (unlocks Unpaywall, improving coverage),
- Enable `allowGrayArea` (at your own legal risk) and retry, or use `scholar_scihub_download` to query Sci-Hub directly,
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
