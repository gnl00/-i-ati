# ADR-0033: Stable tool-result model content

**Status:** Accepted<br>
**Date:** 2026-10-01<br>
**Supersedes:** Tool-result replay and semantic compaction in [ADR-0009](0009-background-tool-result-compaction.md)<br>
**Related:** [Tool-result contract](../specs/tools/tool-result-normalization.md)

## Decision

Prepare a deterministic, bounded `ToolResultFact.modelContent` at tool completion,
before emitting the completion event. Keep `content`, status, failure and timing
as the original execution facts. Persist raw text in `messages.body.content` and
the stable projection in `messages.body.toolResultModelContent`. No schema change
is required. History seeds carry the saved projection; legacy raw results are
prepared once at runtime bootstrap. Each subsequent request uses the same model
content, regardless of later assistant steps. Terminal snapshots only copy the
record list and perform no normalization or filesystem writes.

Small results remain complete. Large text or inline images are stored inside the
active workspace at `.ati/artifacts/tools/<content-sha256>/content.txt` and optional
image files under `.tmp/images/<sha256>.<ext>`. Text is UTF-8, directly readable with existing `read` line/column
continuation. Repeated content produces the same recovery paths. The final model
string is at most 32,000 JavaScript characters, including failure diagnostics,
preview, omission marker and recovery instructions. Save failures keep a bounded
preview and explicitly state that omitted content cannot be recovered. Existing
small tool-managed artifact descriptors pass through unchanged.

Remove hot/cold state, terminal artifact rewriting, semantic provenance envelopes,
tool compactor metadata, background scheduler and compact-row lookup. Retain the
old database table and its existing branch/deletion maintenance; historical rows
are no longer produced or selected for model requests. This avoids destructive
migration and allows rollback to the previous code with raw messages intact.

## Request budget

The request-budget portion of this ADR is superseded by [ADR-0036](0036-runtime-context-manager.md).
ContextManager uses token counting, output reserves, run-local compression and optional history omission.
Current goals, effective contexts and unconsumed tool batches stay complete; stored raw/model content remains unchanged.

## Tool-specific preparation

Embedded tools may set their deterministic model view through the execution
context before returning. Raw result payloads do not select this view by their
JSON shape. ToolExecutor carries the sidecar, the dispatcher adds failure
diagnostics, and runtime normalization enforces the common character ceiling
and extracts inline images from tool-owned views. Images are saved under
`.tmp/images/<sha256>.<ext>` while preserving the selected text preview.

`exec` owns independent stdout/stderr tail budgets at process completion.
`web_fetch` owns inline character/byte budgets and reuses existing workspace
single-file storage. Completed recovery content stays directly in
`.tmp/web-fetch/<uuid>.tmp` for later reads. Text keeps the extracted body; binary
keeps the downloaded bytes. Hash publication, metadata sidecars and stale-part
cleanup are removed. Failed/cancelled writes are still cleaned up. The detailed limits are
recorded in the [normalization spec](../specs/tools/tool-result-normalization.md).

## Consequences and limits

- No extra model request or background job lies on the tool-result path.
- Same-run evidence remains stable until its complete group leaves the request window.
- Raw UI/program output remains separate from model previews.
- Character estimation can under/overestimate provider tokens; provider-specific
  token counting is outside this change.
- Command collection still retains 512 KiB per stream; an artifact cannot recover
  bytes discarded during collection. Streaming full command output is separate work.
- Tool artifacts are retained with the workspace. No automatic expiry or cleanup
  is added; deleting a workspace can invalidate its saved output pointers.

## Verification

Cover long UTF-8 output, image extraction, save failures and symlink confinement,
raw versus model persistence, same-run replay, history bootstrap, complete-pair
request windowing, mandatory-input overflow, denied/aborted results and existing
main/CLI/subagent integration. Run Node/web typechecks, changed-file lint, main
architecture/path checks, full coverage and an isolated Electron file-read smoke.
