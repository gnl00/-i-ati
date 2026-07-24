# Web Fetch Workspace Artifacts

Owner: Repository maintainers<br>
Status: Implemented<br>
Started: 2026-07-24<br>
Target: Keep large fetched responses out of hot model requests by spooling every direct HTTP response to the active workspace, inlining bounded small content, and returning readable workspace artifacts for large content.<br>
Exit criteria: Direct HTTP responses use one workspace spool path; responses above 3 MiB, non-text files, and extracted content above the inline budget return bounded artifact descriptors; source documents stay intact for downstream file tools; `read` responses have a character ceiling; focused tests, type checks, main-process boundaries, documentation paths, and the original 6.75 MiB PDF regression pass.<br>
Related specs: [`../../specs/tools/tool-result-normalization.md`](../../specs/tools/tool-result-normalization.md)<br>
Related decisions: [`../../decisions/0008-workspace-path-confinement.md`](../../decisions/0008-workspace-path-confinement.md), [`../../decisions/0009-background-tool-result-compaction.md`](../../decisions/0009-background-tool-result-compaction.md)<br>
Related implementation: [`../../../src/main/tools/webTools/http/HttpFetcher.ts`](../../../src/main/tools/webTools/http/HttpFetcher.ts), [`../../../src/main/tools/webTools/WebToolsProcessor.ts`](../../../src/main/tools/webTools/WebToolsProcessor.ts), [`../../../src/main/tools/fileOperations/FileOperationsProcessor.ts`](../../../src/main/tools/fileOperations/FileOperationsProcessor.ts)<br>

## Problem

On 2026-07-24, `web_search` fetched the EZ3i product manual as a PDF. The
server returned a 7,076,983-byte response. `HttpFetcher` read the first 5 MiB,
decoded the PDF bytes as text, and produced 4,828,286 characters inside one
search result. The active hot tool-result path replayed the complete payload.
The resulting provider request contained 8,363,729 characters, and the provider
rejected it because its calculated input length exceeded 1,048,570.

The root cause is the direct HTTP path materializing response bytes as an
unbounded model-visible string before the request boundary can apply a useful
guard.

## Goals

1. Route direct HTTP responses by their completed on-disk byte size.
2. Keep every direct HTTP download on one streaming-to-file path.
3. Preserve small fetched content as useful bounded inline text.
4. Promote large responses into the active chat workspace.
5. Give the model workspace-relative source and readable-note paths with
   explicit file-inspection guidance.
6. Preserve original large source files for inspection and future
   re-processing.
7. Bound `read` output by characters in addition to lines.
8. Keep renderer and provider tool-result shapes backward-compatible for
   existing inline web results.

## Scope

This change covers:

- embedded `web_search` and `web_fetch`;
- renderer IPC calls that share the same processors;
- direct HTTP response spooling;
- render-fallback extracted text after the browser path;
- workspace artifact promotion;
- generic non-text source artifacts with bounded diagnostic sidecars;
- web result response contracts;
- bounded text-file reads;
- structured logs, cleanup, tests, and active documentation.

Document parsing, OCR, semantic model-generated summaries, artifact UI
previews, artifact retention outside the workspace lifecycle, and migrations
for existing tool messages belong to downstream tools or follow-up scopes.

## Approved constants

Centralize these values in the webTools implementation:

| Constant | Value | Purpose |
| --- | ---: | --- |
| `WEB_FETCH_ARTIFACT_THRESHOLD_BYTES` | `3 * 1024 * 1024` | Completed source responses above this size become workspace artifacts. |
| `WEB_FETCH_DOWNLOAD_MAX_BYTES` | `50 * 1024 * 1024` | A single direct HTTP response stops at this received-byte ceiling. |
| `WEB_FETCH_INLINE_MAX_CHARACTERS` | `64_000` | Maximum inline content for one `web_fetch`. |
| `WEB_SEARCH_RESULT_INLINE_MAX_CHARACTERS` | `24_000` | Maximum inline content for one search result. |
| `WEB_SEARCH_TOTAL_INLINE_MAX_CHARACTERS` | `96_000` | Maximum inline content across one `web_search` response. |
| `WEB_SEARCH_ARTIFACT_MAX_BYTES` | `100 * 1024 * 1024` | Maximum promoted artifact bytes across one search call. |
| `READ_RESULT_MAX_CHARACTERS` | `32_000` | Maximum text returned by one embedded or legacy `read`. |
| `WEB_FETCH_SUMMARY_MAX_CHARACTERS` | `2_000` | Maximum deterministic artifact summary. |
| `WEB_FETCH_PARTIAL_MAX_AGE_MS` | `24 * 60 * 60 * 1000` | Cleanup age for abandoned spool files. |

Byte thresholds use binary units. Character thresholds use JavaScript string
length, matching the current request guard and tool-result code.

## Target data flow

```text
web_search / web_fetch
  -> resolve active workspace through WorkspacePathResolver
  -> allocate workspace/.tmp/web-fetch/<uuid>.part
  -> direct HTTP response streams into the part file
     -> count received bytes only for the 50 MiB hard stop
     -> update SHA-256 while writing
     -> abort/error closes and removes the part file
  -> close file handle
  -> stat the completed part file
  -> materialize
     -> source bytes <= 3 MiB
        -> textual format
           -> decode and run the existing content extractor
           -> extracted content within inline budget
              -> delete part file
              -> return inline content
           -> extracted content above inline budget
              -> promote readable content as a workspace artifact
              -> return bounded descriptor and summary
        -> non-text format
           -> promote original source and a bounded diagnostic sidecar
           -> return bounded descriptor and summary
     -> source bytes > 3 MiB
        -> atomically promote source into workspace artifact directory
        -> create text content or a bounded format-aware diagnostic in content.md
        -> write metadata.json
        -> return bounded descriptor and summary
  -> active model continuation receives only inline content or the descriptor
  -> model follows the descriptor to inspect the source file or read content.md
     in bounded line windows
```

The 3 MiB route is decided only after the response finishes and `stat` reads
the actual file size. `Content-Length` remains diagnostic metadata. The received
byte counter enforces only the 50 MiB safety ceiling.

## Workspace layout

Use the active chat workspace selected by `WorkspacePathResolver`.

```text
<workspace>/
  .tmp/
    web-fetch/
      <uuid>.part
  .ati/
    artifacts/
      web/
        <sha256-prefix>/
          source.<extension>
          content.md
          metadata.json
```

Rules:

1. Embedded tool calls receive the authoritative `chat_uuid` injected by
   `ToolExecutor`.
2. Renderer IPC calls without a chat UUID use the existing `workspaces/tmp`
   fallback.
3. Every creation target resolves through the shared workspace resolver with
   `intent: "creatable"`.
4. Tool results expose workspace-relative paths.
5. Artifact directory identity uses at least the first 16 hexadecimal SHA-256
   characters.
6. Source filenames use a sanitized URL basename with a safe extension.
7. Temporary names use generated UUIDs and exclusive creation.
8. Promotion closes the temporary handle first and then uses an atomic rename
   inside the same workspace filesystem.

## Component boundaries

### `HttpFetcher`

`HttpFetcher` owns:

- HTTP transport selection;
- redirects;
- response status validation;
- response headers;
- streaming the response body to a supplied spool destination;
- received-byte counting;
- SHA-256 calculation;
- the 50 MiB hard stop;
- abort propagation;
- closing the file and returning download facts.

It returns a provider-neutral download fact:

```ts
interface DownloadedHttpResponse {
  requestedUrl: string
  finalUrl: string
  contentType: string
  declaredContentLength?: number
  receivedBytes: number
  sha256: string
  tempAbsolutePath: string
  tempRelativePath: string
}
```

`WebFetchContentMaterializer` owns the 3 MiB branch and model-visible content
construction.

### `WorkspaceWebFetchArtifactService`

Add a webTools-owned service under
`src/main/tools/webTools/artifacts/WorkspaceWebFetchArtifactService.ts`.

It owns:

- workspace resolution;
- spool directory creation;
- exclusive part-file allocation;
- final `stat`;
- content-addressed artifact directories;
- source promotion;
- readable sidecar writes;
- `metadata.json`;
- cleanup of current-operation partial files;
- cleanup of partial files older than 24 hours;
- workspace-relative descriptor paths.

This service remains separate from
`agent/runtime/tools/result-normalization/ToolResultArtifactStore`. The existing
store owns cold tool-result replay under `userData`; web fetch artifacts must
be reachable by the embedded workspace-confined `read` tool during the active
continuation.

### `WebFetchContentMaterializer`

Add
`src/main/tools/webTools/artifacts/WebFetchContentMaterializer.ts`.

It owns:

- decoding small textual responses with the existing charset behavior;
- calling the existing HTML/content cleaning utilities;
- resolving an effective MIME from response metadata and URL extension;
- routing textual and non-text responses through their artifact forms;
- creating `content.md`;
- deterministic summary construction;
- returning inline content or an artifact result.

Completed size controls text inlining. Format signals select textual extraction
or source-file preservation after the completed response has been classified.

Direct textual artifacts use the canonical `full` cleaning mode for
`content.md`. This keeps the readable sidecar deterministic when `web_search`
and `web_fetch` encounter identical source bytes with different inline modes.

### `WebToolsProcessor`

`WebToolsProcessor` owns:

- passing `chat_uuid` into the artifact service;
- orchestrating spool, fetch, materialization, and render fallback;
- selecting per-tool inline limits;
- enforcing the `web_search` aggregate inline and artifact budgets;
- mapping materialized results into existing web response types;
- preserving snippets when a search item fails or exceeds a budget;
- structured completion and failure logs.

The browser render path already returns extracted text rather than a raw
response stream. Apply the same inline character limits to that string. When
rendered text exceeds its limit, write it directly as `content.md` through the
artifact service and return the same descriptor shape.

### `read`

`processReadTextFile` keeps the existing line-window semantics and adds the
32,000-character ceiling.

The returned range must contain complete lines where possible. When the next
line alone would exceed the ceiling, return a bounded prefix of that line and
include continuation metadata. Extend the response with:

```ts
next_start_line?: number
next_start_column?: number
returned_start_column?: number
returned_end_column?: number
```

This column-aware continuation prevents a single long line from repeating or
skipping content. Existing callers that use only line metadata remain
compatible.

## Artifact response contract

Extend the shared web response types with:

```ts
interface WebFetchArtifact {
  kind: 'workspace_artifact'
  sourcePath: string
  readPath: string
  sizeBytes: number
  sha256: string
  mimeType?: string
  summary: string
}
```

`WebFetchResponse` gains `artifact?: WebFetchArtifact`.
`WebSearchResultV2` gains `artifact?: WebFetchArtifact`.

For artifact results:

- `content` contains a bounded human- and model-readable descriptor;
- `artifact` contains structured fields;
- `title`, `url` or `link`, and search `snippet` retain their current meaning;
- renderer consumers that only read `content` remain functional.

The descriptor text uses this stable order:

```text
Response saved to workspace.
Source file: <sourcePath>
Readable note: <readPath>
Size: <sizeBytes> bytes
MIME: <mimeType when available>
Summary: <bounded summary>

Inspect the source file with a suitable workspace file-reading tool.
Use read with file_path="<readPath>", start_line=1, end_line=200 for the bounded note.
```

## Small-response behavior

After the direct HTTP response is fully spooled:

1. Close the file.
2. Read `stat.size`.
3. When size is at most 3 MiB, read and decode the temporary file.
4. Run the existing content extraction and post-cleaning behavior.
5. Apply the tool-specific inline character budget.
6. Return inline content and remove the temporary file when within budget.
7. Promote the extracted text to `content.md` when above budget.

The existing `MIN_DIRECT_CONTENT` fallback remains active. A small direct
response with insufficient extracted text removes its spool file before the
browser render fallback begins.

## Large-response behavior

After `stat.size` exceeds 3 MiB:

1. Promote the complete source file into the content-addressed artifact
   directory.
2. Detect the document parser through bounded file-signature inspection plus
   URL and response metadata.
3. Generate `content.md`.
4. Generate a deterministic summary from at most the first 2,000 characters of
   readable text.
5. Write `metadata.json`.
6. Return only the descriptor and structured artifact object.

### Text, HTML, JSON, Markdown, XML, YAML, CSV, and logs

Decode with the current charset rules. Apply the existing HTML extraction for
HTML content. Store canonical `full`-mode readable content in `content.md`.

### Non-text files, including PDF

Preserve the original source artifact for every non-text response. Generate a
short `content.md` containing byte size, effective MIME, and source inspection
guidance. Return the same bounded descriptor with `sourcePath`, `readPath`,
size, MIME, hash, and summary.

PDF uses this generic file-artifact path. The model selects a workspace
file-reading tool for the preserved `source.pdf`. Fetch materialization records
the download facts and leaves document text, page count, and OCR to that tool.

## Search fan-out budgets

`web_search` keeps the current concurrency semaphore and adds per-call budget
accounting:

1. Each result may inline at most 24,000 characters.
2. Results consume a shared 96,000-character inline budget in result order.
3. Each promoted source consumes its actual `stat.size`.
4. The call promotes at most 100 MiB of source artifacts.
5. A result that would exceed the artifact budget keeps title, link, and
   snippet, and receives a structured budget-exceeded error.
6. Concurrent scrape completions reserve budgets through one synchronous
   coordinator so totals remain deterministic.

## Failure and cleanup semantics

| Condition | Behavior |
| --- | --- |
| HTTP failure | Close and delete the current part file; return the existing web failure shape. |
| Abort or timeout | Cancel the response reader, close the handle, delete the part file, and preserve the existing timeout/abort result. |
| Response exceeds 50 MiB | Cancel the reader, delete the part file, and return `WEB_FETCH_DOWNLOAD_TOO_LARGE`. |
| Small-content decode failure | Delete the part file and continue to browser render fallback when eligible. |
| Source promotion failure | Keep the part file only until the operation error boundary runs; cleanup removes it before returning failure. |
| Non-text response | Preserve the promoted source, write a bounded diagnostic `content.md`, and return the artifact descriptor. |
| Metadata write failure | Remove the incomplete artifact directory and return failure. |
| Process exit during download | A `.part` file may remain; the next service initialization removes entries older than 24 hours. |
| `read` line exceeds 32,000 characters | Return a bounded segment with line-and-column continuation metadata. |

## Logging

Add structured events:

- `web_fetch.spool.started`
- `web_fetch.spool.completed`
- `web_fetch.spool.failed`
- `web_fetch.download_too_large`
- `web_fetch.inline.materialized`
- `web_fetch.artifact.promoted`
- `web_fetch.artifact.materialized`
- `web_fetch.partial.cleanup_completed`
- `read_text_file.character_limit_applied`

Logs include URL, received bytes, route, relative artifact paths, duration,
extracted characters, and safe error codes. Logs exclude document content and
host-absolute workspace paths.

## Security boundaries

1. Resolve workspace targets through `WorkspacePathResolver`.
2. Use generated temporary names and sanitized final filenames.
3. Verify the destination remains within the active workspace before every
   write, rename, and cleanup operation.
4. Expose only workspace-relative paths to the model and renderer.
5. Apply the existing HTTP redirect and abort behavior.
6. Enforce byte limits from received stream data.
7. Treat server-provided filenames and response metadata as untrusted input.
8. Keep executable and unknown binary content as inert files.

## Implementation sequence

Ship this as one coherent change because the large-result descriptor requires a
readable workspace artifact and the `read` guard in the same release.

1. Add shared web artifact response types.
2. Add `WorkspaceWebFetchArtifactService` with resolver-backed paths, spool
   allocation, promotion, metadata, and cleanup.
3. Refactor `HttpFetcher` to stream every direct HTTP response to a supplied
   part file and return download facts.
4. Add `WebFetchContentMaterializer` for small inline text, source artifacts,
   summaries, and diagnostics.
5. Update progressive fetch and browser-render fallback orchestration.
6. Thread authoritative `chat_uuid` into embedded and IPC web calls.
7. Add per-result and per-search budgets.
8. Add the `read` character ceiling and column-aware continuation response.
9. Update tool definitions to tell the model that artifact results return a
    `readPath`.
10. Synchronize the active tool-result normalization spec and current chat
    runtime architecture.
11. Run focused and architectural verification.

## Test plan

### HTTP spool tests

- every successful response writes to a part file before classification;
- completed `stat.size` remains authoritative when `Content-Length` is missing
  or inaccurate;
- completed `stat.size` selects the route;
- a response above 50 MiB is cancelled and cleaned;
- abort and timeout remove the part file;
- SHA-256 and received bytes match the source;
- redirects preserve requested and final URL metadata.

### Small-content tests

- small HTML preserves current clean extraction;
- small Markdown and plain text preserve current charset behavior;
- inline content is removed from the temporary directory after success;
- extracted text above the inline budget becomes an artifact;
- insufficient direct content cleans up before browser fallback.

### Large-artifact tests

- a response one byte above 3 MiB becomes a workspace artifact;
- artifact paths are workspace-relative;
- custom chat workspaces receive their own artifacts;
- source promotion is atomic;
- metadata contains byte size, hash, URL, response metadata, and extraction
  facts;
- stale part files older than 24 hours are removed;
- current part files remain during cleanup.

### PDF regression tests

- the 7,076,983-byte EZ3i-size fixture produces a bounded artifact descriptor;
- PDF bytes remain intact in `source.pdf`;
- `application/octet-stream` plus a `.pdf` URL resolves to `application/pdf`;
- `content.md` contains a bounded source-inspection diagnostic;
- the descriptor contains source path, MIME, bounded summary, and `readPath`;
- a small PDF follows the same raw artifact contract.

### Search budget tests

- multiple small results obey the 96,000-character aggregate limit;
- concurrent large results obey the 100 MiB artifact limit;
- budget-exceeded results retain title, link, and snippet;
- one large PDF result cannot expand the hot tool result beyond the descriptor
  budget.

### Read tests

- default 200-line behavior remains;
- explicit line windows remain;
- output stops at 32,000 characters;
- one long line returns column continuation metadata;
- following the continuation reads every character exactly once;
- UTF-8 multibyte text remains intact.

## Verification commands

```bash
./node_modules/.bin/vitest run \
  src/main/tools/webTools/__tests__/WebToolsProcessor.test.ts \
  src/main/tools/webTools/__tests__/webToolsUnits.test.ts \
  src/main/tools/fileOperations/__tests__/FileOperationsProcessor.test.ts

./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
git diff --check
```

Run a real-runtime regression with the EZ3i manual URL. The acceptance evidence
must show:

1. the complete 7,076,983-byte source exists under the chat workspace;
2. the tool result contains a bounded descriptor;
3. the source path is available to a workspace PDF-reading tool;
4. the next provider request stays below the provider input ceiling;
5. `.tmp/web-fetch` contains no completed-operation part file.

## Verification record

The original EZ3i response captured on 2026-07-24 measured 7,076,983 bytes.
The current regression fixture uses that exact size and verifies:

- the artifact source retains all 7,076,983 bytes;
- the PDF header bytes remain intact;
- the tool-visible descriptor stays below 4,000 characters;
- `application/octet-stream` plus the final `.pdf` URL resolves to
  `application/pdf`;
- `content.md` contains a bounded source-inspection diagnostic;
- completed-operation spool directories are empty.

Focused verification on 2026-07-24:

- 75 focused Vitest tests passed across webTools and file operations;
- the main-process TypeScript check passed;
- main-process dependency boundaries, active documentation paths, and seven
  architecture checks passed;
- `git diff --check` passed;
- the Electron main and preload production bundles completed;
- the renderer bundle reached its existing unresolved
  `@codemirror/state` entry dependency.

## Rollback

The implementation adds workspace files and response fields; the database
schema stays unchanged. Existing `.ati/artifacts/web` directories remain
ordinary workspace content under workspace lifecycle management. Rollback
removes the producer-side artifact path and optional response fields.
