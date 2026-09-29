# Web Search and Fetch

Last verified against source: 2026-09-29.

## Runtime ownership

[WebToolsProcessor](../../../src/main/tools/webTools/WebToolsProcessor.ts) owns
search and fetch orchestration in main. [BrowserWindowPool](../../../src/main/tools/webTools/BrowserWindowPool.ts)
owns reusable Electron windows and capacity permits. Production uses Electron
windows and direct HTTP, with Cheerio extraction and Turndown Markdown conversion.

The pool configures one search window and three content windows. Acquisition can
initialize the pool lazily. Operations release their windows in `finally`,
including failed or destroyed windows, so later requests retain capacity.

## Search

1. Normalize `param` or `query`, resolve the configured result count and engine.
2. Load the search page and capture URL, title and body diagnostics.
3. Classify the page, wait for result containers and extract result metadata.
4. Apply the result quality gate before fetching result pages or returning snippets.
5. Return snippets directly when `snippetsOnly` is enabled; otherwise fetch the
   result pages with bounded concurrency, time and artifact budgets.

Engine definitions support Bing, Google and DuckDuckGo. Bing degraded pages and
obviously irrelevant result collections fail with `success: false`. These
heuristics reject known bad result shapes; they do not prove that accepted pages
answer the question.

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
selects bounded inline text or an artifact descriptor while retaining the source.
Large bodies and non-text documents stay available to workspace file tools.

Current limits come from [constants.ts](../../../src/main/tools/webTools/artifacts/constants.ts):

| Limit | Value |
| --- | --- |
| Fetch artifact byte threshold | 3 MiB |
| Maximum direct download | 50 MiB |
| Fetch inline text | 64,000 characters |
| Search inline text per result | 24,000 characters |
| Total search inline text | 96,000 characters |
| Search artifact budget | 100 MiB |
| Artifact summary | 2,000 characters |
| Stale partial spool age | 24 hours |

See [ADR-0011](../../decisions/0011-size-based-web-fetch-workspace-artifacts.md),
[tool result normalization](../../specs/tools/tool-result-normalization.md) and
[pending live artifact acceptance](../../work/tasks/web-fetch-runtime-acceptance.md).

## Verification and diagnostics

```bash
pnpm exec vitest run \
  src/main/tools/webTools/__tests__/WebToolsProcessor.test.ts \
  src/main/tools/webTools/__tests__/webToolsUnits.test.ts
pnpm run typecheck:node
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
```

These are checks to run after implementation changes. The documentation review
on 2026-09-29 did not rerun behavior tests or measure network performance.

Use structured `web_search` and `web_fetch` logs to separate window acquisition,
page loading, result readiness, extraction, quality rejection and content fetching.
An accepted search result still requires content inspection. For performance
comparisons, record build version, engine, exact query set, cold/warm state,
network conditions, result count and phase timings before reporting a speedup.
Historical benchmark figures are retained in the
[window-pool record](../../archive/2026/integrations/2026-09-29-web-search-window-pool-performance.md)
and have no reproducible current baseline.
