# Web Search and Fetch

Last verified against source: 2026-10-03.

## Runtime ownership

[WebToolsProcessor](../../../src/main/tools/webTools/WebToolsProcessor.ts) owns
search and fetch orchestration in main. [BrowserWindowPool](../../../src/main/tools/webTools/BrowserWindowPool.ts)
owns reusable Electron windows and capacity permits. Production uses Electron
windows and direct HTTP, with Cheerio extraction and Turndown Markdown conversion.

The pool configures one search window and three content windows. Acquisition can
initialize the pool lazily. Operations release their windows in `finally`,
including failed or destroyed windows, so later requests retain capacity.
Window and scrape queues observe cancellation and remove cancelled waiters.
Cleanup timers are cleared before windows become available for reuse.
Cancelled rendered operations and timed-out JS extraction retire their windows;
failed or timed-out blank-page cleanup also retires the window. Acquisition
recreates missing windows as needed so pending renderer work cannot contaminate
another request.

## Search

1. Normalize `param` or `query`, resolve the configured result count and engine.
2. Load the search page and capture URL, title and body diagnostics.
3. Classify the page, wait for result containers and extract result metadata.
4. Apply the result quality gate before fetching result pages or returning snippets.
5. Return snippets directly when `snippetsOnly` is enabled; otherwise fetch the
   result pages with bounded concurrency, time and artifact budgets.

Embedded calls propagate `EmbeddedToolExecutionContext.signal` through searches,
fetches, nested timeouts, HTTP body reads and window acquisition. Background search
has a 60-second overall deadline; interactive IPC search has 180 seconds to allow
manual Google verification. Loading plus snapshot capture is bounded at 23 seconds,
result readiness at 15 seconds and result extraction at 8 seconds. Fetch keeps its
45-second overall deadline; each search content fetch keeps its 37-second budget.
Search queue time is included in the overall deadline.

Prefer `snippetsOnly: true` for initial discovery and fetch selected URLs with
`web_fetch`. Omitting the flag still fetches full content for compatibility.
Each new result includes `contentStatus`: `not_requested`, `fetched`, `failed`,
or `blocked`. Existing `success` semantics are unchanged: response success means
search discovery succeeded; item success in full-content mode means fetching
succeeded. A failed content fetch still retains the search title, snippet and link.

Engine definitions support Bing, Google and DuckDuckGo. Bing degraded pages and
obviously irrelevant result collections fail with `success: false`. These
heuristics reject known bad result shapes; they do not prove that accepted pages
answer the question.

Before fetching content, search selects from up to twice the requested result
count (maximum 20 candidates). Query-matching first-party domain labels precede
other results, with engine order retained among peers. Community subdomains do
not receive that preference. Explicit prerelease titles are demoted unless the
query names a version or asks for prereleases. This is a conservative ordering
heuristic, not an authoritative source registry or a guarantee of the latest version.

Duplicate keys ignore fragments, common tracking parameters and `www`; meaningful
query parameters remain. Apple support regional mirrors collapse within the same
language and article/version path. Returned URLs remain the actual selected URLs.
Different languages and versions stay separate. Selection runs before content
fetching, so duplicates do not consume download or artifact budgets.

Google readiness and extraction share the same heading-and-link parser. Navigation
links cannot satisfy readiness. Plain `/url` targets are decoded directly; opaque
`/goto` links are resolved from Electron HTTP redirect events without downloading
the destination body. Each redirect has a 5-second limit and observes run cancellation;
unresolved links are omitted. Anti-bot handling remains separate.

Google verification handling depends on the internal `interactive` flag and the
main window's visibility. Background calls can fall back to Bing once rather
than wait for manual verification. A renderer request must use the app's IPC
wrapper and its supported arguments:

```ts
import { invokeWebSearchIPC } from '@renderer/infrastructure/ipc/integrations'

const result = await invokeWebSearchIPC({
  param: 'example query',
  engine: 'bing',
  fetchCounts: 3,
  snippetsOnly: true
})
```

See [the shared channels](../../../src/shared/constants/index.ts) and
[tool input definitions](../../../src/shared/tools/webTools/definitions.ts) for
IPC and model-facing contracts. Keep ad hoc browser scripts out of renderer.

## Fetch and workspace artifacts

Fetch first tries direct HTTP. A readable artifact or sufficient extracted text
can satisfy the request directly; insufficient text or recoverable direct-fetch
failure falls back to a pooled rendered page. Size/budget rejection and an
aborted operation do not proceed to that fallback.

[HttpFetcher](../../../src/main/tools/webTools/http/HttpFetcher.ts) spools direct
responses to the chat workspace. The
[materializer](../../../src/main/tools/webTools/artifacts/WebFetchContentMaterializer.ts)
selects bounded inline text or an artifact descriptor. Text artifacts contain the
extracted Markdown body; binary artifacts retain downloaded bytes. Original HTML
is not retained in the current single-file layout. Binary materialization reads
only a 4 KiB sample for classification instead of rereading the whole download.
Text still requires a full in-memory decode and synchronous extraction.

Content extraction prefers a qualifying article body over its surrounding guide
or TOC shell, including Apple guide `#article-section` / `.book-content` containers.
It retains a documentation main when there is no qualifying nested article.
Both cleaning modes preserve code fences, indentation, tabs, blank lines and full
code blocks, including syntax-highlighted `<pre>` without a `<code>` child. Lite mode removes prose noise outside fenced/indented content; size
limits and artifact materialization bound output instead of truncating code.

Empty extracted text fails with `WEB_FETCH_EMPTY_CONTENT`. Explicit verification,
access-denied and login interstitials fail with `WEB_FETCH_BLOCKED_PAGE`, including
large bodies that would otherwise become artifacts. This conservative check does
not establish article completeness or detect all paywalls. Recoverable direct
HTML failures can still try the rendered page; both paths validate content.
Large bodies and non-text documents stay available to workspace file tools.

Current limits come from [constants.ts](../../../src/main/tools/webTools/artifacts/constants.ts):

| Limit | Value |
| --- | --- |
| Fetch artifact byte threshold | 3 MiB |
| Maximum direct download | 50 MiB |
| Fetch inline text | 24,000 characters |
| Inline UTF-8 bytes | 48,000 bytes |
| Search inline text per result | 24,000 characters |
| Total search inline text | 96,000 characters |
| Search artifact budget | 100 MiB |
| Artifact summary | 2,000 characters |

Completed files are retained with the workspace; failed or cancelled writes are
removed. There is no automatic stale-file expiry.

See [ADR-0011](../../decisions/0011-size-based-web-fetch-workspace-artifacts.md),
[tool result normalization](../../specs/tools/tool-result-normalization.md) and
[pending live artifact acceptance](../../work/tasks/web-fetch-runtime-acceptance.md).

## Verification and diagnostics

```bash
pnpm exec vitest run \
  src/main/tools/webTools/__tests__/BrowserWindowPool.test.ts \
  src/main/tools/webTools/__tests__/WebToolsProcessor.test.ts \
  src/main/tools/webTools/__tests__/webToolsUnits.test.ts \
  src/main/tools/webTools/__tests__/googleRedirects.test.ts \
  src/main/tools/webTools/__tests__/searchResultSelection.test.ts
pnpm run typecheck:node
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
```

The 2026-10-02 regression checks also cover timeout cleanup after immediate reuse,
cancelled queues, cancellation just after acquiring a permit, stalled HTTP body
reads, parent/child cancellation, empty and blocked content, and content-status
compatibility. An isolated Electron 44.5.0 run with local HTTP fixtures verified
navigation lasting beyond the old cleanup timer, direct text, rendered SPA content,
empty/blocked rejection, HTTP cancellation, and cancellation of an infinite-loop
renderer followed by another successful fetch.

An additional isolated online run on 2026-10-03 verified Google opaque-link
resolution, Apple guide extraction (the sampled article began at its heading,
with 1,123 characters rather than roughly 20,000 characters of TOC and body),
first-party Python documentation ordering, and regional mirror deduplication.
The Python sample retained 81 fenced blocks and 219 unescaped REPL prompts.
Public search rankings and network conditions vary; these samples establish
specific behavior, not a statistically reliable overall speedup. Provider input
acceptance and general article completeness remain separate acceptance tasks.

Use structured `web_search` and `web_fetch` logs to separate window acquisition,
page loading, result readiness, extraction, quality rejection and content fetching.
An accepted search result still requires content inspection. For performance
comparisons, record build version, engine, exact query set, cold/warm state,
network conditions, result count and phase timings before reporting a speedup.
Historical benchmark figures are retained in the
[window-pool record](../../archive/2026/integrations/2026-09-29-web-search-window-pool-performance.md)
and have no reproducible current baseline.
