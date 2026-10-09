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
Rendered Python documentation adds `button.copybutton` controls next to code
blocks. Both cleaning modes remove those exact controls before Markdown conversion,
and readiness snapshots ignore them so their feedback text cannot reset stability.
Ordinary prose, escaped code examples and other buttons are retained.

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

### Installed-app comparison (2026-10-09)

The installed 1.2.2 app and development commit `65b90794` were exercised through
their real preload IPC handlers. The initial development process still ran the
old Main code; it was restarted and its initial samples were excluded. Restart
the development app after Main changes and verify behavior before comparing builds.

Bing searches requested three results, with three runs per query and existing
caches retained. All runs selected the same links across both builds:

| Query | Installed median | Development median | Result JSON bytes, installed → development |
| --- | --- | --- | --- |
| Python asyncio documentation | 2,200 ms | 509 ms | 22,219 → 1,046 |
| Electron BrowserWindow documentation | 885 ms | 524 ms | 18,232 → 1,012 |

Search now ends at discovery; the old app fetched all selected sources. These
figures compare those different search contracts, not time to read full sources.
The Python third-party mirror failed during the old automatic body fetch while
discovery still succeeded. New discovery success does not establish source accessibility.

Six local fixtures, each fetched once per build, verified delayed SPA content,
static and short articles, persistent loading, blocked pages and raw text files.
The old app returned `Loading...` as successful content from the delayed SPA;
development returned its final paragraph and code after 2,162 ms. Persistent
loading became `WEB_FETCH_CONTENT_NOT_READY` instead of false success. Static
fixture fetch time increased from 36 to 1,098 ms, reflecting the 900 ms stability
window; raw text took 7 ms in both builds. The stability window remains unchanged
because these samples do not establish a safe shorter wait for asynchronous pages.

Single live fetches of `https://example.com` and Python's
`https://docs.python.org/3/library/asyncio-task.html` succeeded in both builds.
Python fetch time was 291 ms installed and 2,025 ms rendered. Both workspace
Markdown files retained 34 code blocks, but rendered output included 33 injected
`Copy` labels. A subsequent DOM probe identified 33 `button.copybutton` controls;
the shared extractor and readiness snapshot now filter that exact structure.
After the filter change, an isolated Electron run using production web-tool code
returned 57,385 bytes of Python Markdown with zero copy-control labels and all
34 code blocks retained. Local fixtures verified that changing copy-button
feedback does not delay otherwise stable content, a delayed SPA still returns
its final paragraph and code, and persistent loading still fails explicitly.
All three local pages were requested once. Logging, config and workspace bindings
were isolated; the next model-provider request was not exercised.
The restarted development app's actual IPC fetch also returned the Python
artifact in 1,887 ms: its 57,385 bytes matched the installed reference byte for
byte, with zero injected copy labels and all 34 code blocks intact.

A further restarted-app comparison after the Copy-control fix ran 50 actual IPC
requests against installed 1.2.2 and development, retaining existing caches.
Each build ran seven local fixtures, three runs of each of the two Bing queries,
three fetches each of Example Domain and Python tasks, and three runs per query
of a search-and-read-one-source flow. Search medians were 2,613 → 459 ms for
Python and 975 → 422 ms for Electron; all selected links remained identical.
Live fetch medians were 77 → 1,082 ms for Example Domain and 134 → 1,308 ms for
Python tasks. All six Python task artifacts had identical SHA-256 hashes,
57,385 bytes, 34 code blocks and zero injected Copy labels. Delayed SPA and
persistent-loading behavior remained correct; changing copy-control feedback
was excluded from both extracted content and readiness.

The read-one-source flow timed only tools, excluding model reasoning. Installed
search fetched all three sources automatically; development search was followed
by an explicit full-mode fetch of the selected link:

| Selected source | Installed flow median | Development flow median |
| --- | --- | --- |
| Python asyncio overview | 1,705 ms | 1,480 ms |
| Electron English BrowserWindow API | 879 ms | 2,236 ms |

All six bodies per selected source were byte-identical across builds. Search
discovery is faster, while total reading time depends on the selected page's
rendering cost. These samples do not establish a universal end-to-end speedup.
These small samples establish specific runtime behavior. General performance,
other copy-control markup and the next model-provider request remain separate
acceptance questions.

Use structured `web_search` and `web_fetch` logs to separate window acquisition,
page loading, result readiness, extraction, quality rejection and content fetching.
An accepted search result still requires content inspection. For performance
comparisons, record build version, engine, exact query set, cold/warm state,
network conditions, result count and phase timings before reporting a speedup.
Historical benchmark figures are retained in the
[window-pool record](../../archive/2026/integrations/2026-09-29-web-search-window-pool-performance.md)
and have no reproducible current baseline.

Fetch phase diagnostics and the next optimization gates are documented in
[Web Fetch phase timing optimization](../../work/plans/web-fetch-phase-timing-optimization.md).


### Rendered documentation controls

Readiness snapshots and Markdown extraction share the selectors in
`src/main/tools/webTools/util/renderedControlSelectors.ts`. They remove native
Python/Sphinx copy buttons, Docusaurus copy buttons with the exact accessible
label `Copy code to clipboard`, VitePress copy buttons with `data-copied` directly
inside language wrappers, and Docusaurus mobile TOC buttons inside their known
wrapper. Button text is not used as a general removal rule; ordinary buttons,
tabs, prose, section links and escaped HTML source remain content.

Readiness evaluates busy/progress markers on the cleaned clone. Feedback inside
recognized controls or excluded chrome does not make the article busy; a busy
article root or retained content progress marker still prevents readiness.
The navigation-first order, 900 ms stability interval and 8-second deadline remain.

Runtime validation on 2026-10-09 used six actual IPC fetches after restarting
`pnpm dev`: changing control feedback completed in 1,086 ms with a 909 ms stable
observation; delayed SPA returned final content, and persistent loading failed.
Python output retained its prior hash, 57,385 bytes and 34 code blocks. Electron
output changed from 93,969 to 93,955 bytes by removing only `On this page` and its
paragraph separator, retaining 17 code blocks. Vite retained 40,033 bytes and
57 code blocks. Captured Electron/MDN/Vite DOM comparisons in both clean modes
confirmed only that known TOC text changed; icon-only copy controls had not added
Markdown text in these captured pages. The changing-feedback fixture verifies
their effect on readiness. Shadow DOM and unrecognized controls remain outside
this rule set; model/provider follow-up was not exercised.


### Multi-source concurrency acceptance

The three content windows support parallel IPC fetches. A 2026-10-09 development
run executed 51 requests in 15 batches: three distinct local sources had serial
and parallel batch medians of 4,042 and 2,139 ms; Python/Electron/Vite document
medians were 4,948 and 2,222 ms. Source hashes matched, 18 artifact paths were
unique, six queued SPA requests completed in two waves, and a mixed batch with
loading/blocked failures did not prevent subsequent successful fetches.
These are warm, small-sample tool measurements, not universal performance claims.

The Agent dispatcher now groups consecutive `web_fetch` calls whose confirmation
policy is `not_required`, at most three per group, and passes them to the existing
executor. Groups settle before the next group starts. Other tools, approval calls
and user questions preserve their sequencing boundaries. Completion events follow
actual completion; final results retain original call order. Parent cancellation
waits for launched calls and prevents later groups from starting.

A real development chat on 2026-10-09 with DeepSeek emitted these three sources in
one model batch. All started within 1 ms; Python/Vite/Electron finished in
1,898/2,894/3,478 ms. All three artifacts were read in the following model round,
and the final answer reported their titles. This validates the ordinary chat
path; the single batch is not a paired end-to-end speed benchmark. Failure and
cancellation scenarios are covered by automated tests.
Keep the existing window count. See [ADR-0044](../../decisions/0044-bounded-web-fetch-batch-concurrency.md)
and the [optimization plan](../../work/plans/web-fetch-phase-timing-optimization.md)
for scheduling semantics and evidence.
