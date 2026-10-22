# ADR-0052: Streamed command output artifacts

**Status:** Accepted<br>
**Date:** 2026-10-22<br>
**Updates:** Command capture limits in [ADR-0033](0033-stable-tool-result-model-content.md)

## Decision

Keep the 512 KiB head/tail preview per command stream. Capture stdout/stderr raw
bytes to separate exclusive files as process chunks arrive, before preview loss.
Use confined workspace paths under .ati/artifacts/commands, directory mode 0700
and file mode 0600. The result exposes path, saved bytes, completeness and storage
failure per stream. Log-unsaved byte counts describe missing disk capture;
unsaved bytes may still exist in the bounded preview. Complete=true means that
file captured the entire observed stream, not that the command succeeded.

Limit each stream to 64 MiB and managed command logs to 512 MiB per workspace in
one app process. Recount retained managed files at admission and share usage among
active spools. Quota or I/O failure stops logging for the affected stream while
command execution and bounded previews continue. No log failure retries the
command. Cancellation after process dispatch returns structured cancellation
facts with partial output and artifact references, including skill script calls.
Cancellation before dispatch retains the existing abort path.

Capture uses synchronous bounded writes, consistent with existing artifact
materialization. This keeps collection memory bounded without another unbounded
write queue. Main-thread write latency and managed-directory traversal are known
ceilings; switch to asynchronous backpressure or an index only after measurement.
Close descriptors on every process terminal path. These files are not fsynced and
make no power-loss durability promise. Quotas are not a cross-process filesystem
transaction and do not govern external writers.

Retain logs with the workspace and never age-prune live references. Workspace
removal invalidates paths; read reports that failure. Partial capped raw logs can
end mid-codepoint or contain binary output; inspect them as bytes when UTF-8 Read
rejects them. Existing model-view suffix budgets and stable replay stay unchanged.

## Verification

Recover a unique middle marker beyond preview buffers, verify raw UTF-8 bytes,
per-stream/shared quota bounds, symlink confinement, nonzero/spawn/timeout/abort
paths, partial cancellation facts, descriptor cleanup and existing skill execution.
No database migration, extra model request, setting or dependency is introduced.
