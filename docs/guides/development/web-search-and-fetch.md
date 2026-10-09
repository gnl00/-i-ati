# Web Search and Fetch

Last verified against source: 2026-10-09.

## Runtime ownership

[WebToolsProcessor](../../../src/main/tools/webTools/WebToolsProcessor.ts) owns
search and fetch orchestration in main. [BrowserWindowPool](../../../src/main/tools/webTools/BrowserWindowPool.ts)
owns reusable Electron windows and capacity permits. Production uses Electron
windows and direct HTTP, with Cheerio extraction and Turndown Markdown conversion.

The pool configures one search window and three content windows. Acquisition can
initialize the pool lazily. Operations release their windows in `finally`,
including failed or destroyed windows, so later requests retain capacity.
Window queues observe cancellation and remove cancelled waiters.
Cleanup timers are cleared before windows become available for reuse.
Cancelled rendered operations and timed-out JS extraction retire their windows;
failed or timed-out blank-page cleanup also retires the window. Acquisition
recreates missing windows as needed so pending renderer work cannot contaminate
another request.

## Search

1. Normalize `param` or `query`, resolve the configured result count and engine.
2. Load the search page and capture URL, title and body diagnostics.
3. Classify the page, wait for result containers and extract result metadata.
4. Select, deduplicate and apply the result quality gate.
5. Return search-result titles, snippets and links. Source pages are not loaded.

Embedded calls propagate `EmbeddedToolExecutionContext.signal` through searches,
fetches, nested timeouts, HTTP body reads and window acquisition. Background search
has a 60-second overall deadline; interactive IPC search has 180 seconds to allow
manual Google verification. Loading plus snapshot capture is bounded at 23 seconds,
result readiness at 15 seconds and result extraction at 8 seconds. Fetch keeps its
45-second overall deadline.
Webpage navigation is bounded at 15 seconds, content readiness at 8 seconds and
DOM extraction at 8 seconds.
Search queue time is included in the overall deadline.

`web_search(query, engine?)` only discovers sources. Results contain `query`,
`success`, `title`, `snippet` and `link`; response success means search discovery
passed the quality gate. No result-body `content`, `artifact` or `contentStatus`
fields are produced. Select relevant links and call `web_fetch(url, cleanMode?)`
explicitly to read their bodies. Search does not acquire content windows, download
source files or allocate workspace web-fetch artifacts. The former search-mode
parameter and search-body concurrency/inline/artifact budgets are retired.
See [ADR-0043](../../decisions/0043-search-discovery-and-explicit-fetch.md).

Engine definitions support Bing, Google and DuckDuckGo. Bing degraded pages and
obviously irrelevant result collections fail with `success: false`. These
heuristics reject known bad result shapes; they do not prove that accepted pages
answer the question.

Search selects from up to twice the requested result
count (maximum 20 candidates). Query-matching first-party domain labels precede
other results, with engine order retained among peers. Community subdomains do
not receive that preference. Explicit prerelease titles are demoted unless the
query names a version or asks for prereleases. This is a conservative ordering
heuristic, not an authoritative source registry or a guarantee of the latest version.

Duplicate keys ignore fragments, common tracking parameters and `www`; meaningful
query parameters remain. Apple support regional mirrors collapse within the same
language and article/version path. Returned URLs remain the actual selected URLs.
Different languages and versions stay separate. Selection runs before returning discovery results, so duplicates do not consume
result slots. Source fetching happens only through subsequent explicit calls.

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
  fetchCounts: 3
})
```

See [the shared channels](../../../src/shared/constants/index.ts) and
[tool input definitions](../../../src/shared/tools/webTools/definitions.ts) for
IPC and model-facing contracts. Keep ad hoc browser scripts out of renderer.

## Fetch and workspace artifacts

Webpages always load in a pooled Electron window, then the rendered DOM goes
through the shared Cheerio/Turndown extractor. There is no HTTP-first content
length gate or HTTP fallback after a rendering failure. Explicit fetches of
selected search links use this routing. See [ADR-0042](../../decisions/0042-electron-rendered-web-fetch.md).

Known raw/file URLs (including text, PDF, images, archives and office documents),
`raw.githubusercontent.com`, and `raw=1` download directly over HTTP. An
extensionless URL that Chromium identifies as a download is cancelled before
unmanaged saving and handed to the bounded workspace downloader. Only downloads
from the acquired window are intercepted; the listener is removed after navigation.
Chromium may reject navigation before its download event: `ERR_ABORTED` and
`ERR_FAILED` allow up to one second for that event within the navigation budget.
Other navigation failures return directly. This handles file responses, not
login/verification interactions or script-driven export workflows.

Content windows stay hidden, with offscreen painting disabled and background
throttling disabled so asynchronous page work continues. After loading, readiness
samples nonempty article/main content (body when no populated candidate exists),
excluding structural chrome, explicitly hidden nodes, scripts and styles.
Loading-only text and explicit busy/progress states do not satisfy readiness.
A snapshot must stay unchanged for 900 ms, sampled every 300 ms. This permits
complete short articles without a minimum text-length gate. At the 8-second
readiness deadline, continuously changing usable content can still be extracted;
a remaining loading/busy shell fails with `WEB_FETCH_CONTENT_NOT_READY`.
Empty and blocked content retain their existing error codes. Stability does not
prove completeness: late updates, pagination, clicks, virtual lists, iframes and
closed shadow roots may require browser interaction. Navigation completion itself
does not establish SPA readiness.

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
not establish article completeness or detect all paywalls. Both the direct-download
and rendered-page paths validate extracted content.
Large bodies and non-text documents stay available to workspace file tools.

Current limits come from [constants.ts](../../../src/main/tools/webTools/artifacts/constants.ts):

| Limit | Value |
| --- | --- |
| Fetch artifact byte threshold | 3 MiB |
| Maximum direct download | 50 MiB |
| Fetch inline text | 24,000 characters |
| Inline UTF-8 bytes | 48,000 bytes |
| Artifact summary | 2,000 characters |

Completed files are retained with the workspace; failed or cancelled writes are
removed. There is no automatic stale-file expiry.

See [ADR-0011](../../decisions/0011-size-based-web-fetch-workspace-artifacts.md),
[tool result normalization](../../specs/tools/tool-result-normalization.md) and
[pending live artifact acceptance](../../work/tasks/web-fetch-runtime-acceptance.md).

## Verification and diagnostics

```bash
pnpm exec vitest run src/main/tools/webTools/__tests__ src/main/services/skills/__tests__/SkillService.test.ts src/renderer/src/infrastructure/ipc/__tests__
pnpm run typecheck
pnpm run check:main-boundaries
pnpm run test:main-architecture
pnpm run check:main-doc-paths
pnpm run check:renderer-boundaries
pnpm run test:renderer-architecture
pnpm run check:renderer-doc-paths
pnpm exec eslint --quiet \
  src/main/tools/webTools/WebToolsProcessor.ts \
  src/main/tools/webTools/artifacts/WebFetchContentMaterializer.ts \
  src/main/tools/webTools/artifacts/constants.ts \
  src/main/tools/webTools/__tests__/WebToolsProcessor.test.ts \
  src/main/services/skills/__tests__/SkillService.test.ts \
  src/shared/tools/webTools/index.d.ts \
  src/shared/tools/webTools/definitions.ts \
  src/renderer/src/infrastructure/ipc/__tests__/ipcInvoker.domains.test.ts
pnpm exec eslint --quiet src/main/ipc/tools.ts src/renderer/src/infrastructure/ipc/integrations.ts
pnpm test:coverage
pnpm exec electron-vite build
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

The 2026-10-09 render-only change passed 113 web-tool tests and full V8 coverage
(2,788 tests passed, 30 skipped), Node typecheck, changed-file ESLint with no
errors, main boundary/architecture/doc checks and the production Electron/Vite
bundle. Repository Prettier warnings remain under the existing lint configuration;
`--quiet` suppresses warnings rather than reformatting the full processor.
An isolated Electron 44.5.0 process with local HTTP fixtures passed 11 scenarios:
delayed SPA content with code blocks, short articles, raw files, extensionless
attachments, blocked/empty/loading rejection, automatic hung-renderer timeout,
reuse after timeout, cancellation, and reuse after cancellation. Each sampled
webpage was requested once per fetch; an extensionless attachment was requested
once for Chromium classification and once by the bounded downloader. The harness
used production fetch/pool/extraction/materialization code with isolated logging,
config and workspace bindings. Installed-app and live-provider acceptance were
not exercised by that harness.

The subsequent 2026-10-09 discovery-only change passed 137 focused tests and
full V8 coverage (2,786 passed, 30 skipped), both typechecks, main and renderer
boundary/architecture/documentation checks, and the production bundle. Eight
changed source/test files passed ESLint error checks. Full lint on the two IPC
modules still reports nine pre-existing errors: three unused event parameters in
Main and six explicit `any` annotations in unrelated renderer integrations. HEAD
has the same Main errors and seven renderer annotations; typing the search
response removed one. No new lint errors were introduced. Formatting warnings
remain under the existing configuration.

Four isolated Electron/local-fixture scenarios verified discovery without source
navigation or workspace writes, explicit selected-source fetching, search
cancellation, and search-window capacity restoration. Production engine parsing,
quality gates, selection, window pooling and fetch code ran against a local Bing
DOM fixture; the harness mapped search navigation and snapshot URL identity to
the fixture and isolated config/logging/workspace bindings. The search returned
only metadata, neither destination was requested until explicit fetch, and only
the selected destination was then loaded. This verifies the split locally;
installed-app and live search/provider acceptance remain separate.

Use structured `web_search` and `web_fetch` logs to separate window acquisition,
page loading, result readiness, extraction, quality rejection and content fetching.
An accepted search result still requires content inspection. For performance
comparisons, record build version, engine, exact query set, cold/warm state,
network conditions, result count and phase timings before reporting a speedup.
Historical benchmark figures are retained in the
[window-pool record](../../archive/2026/integrations/2026-09-29-web-search-window-pool-performance.md)
and have no reproducible current baseline.
