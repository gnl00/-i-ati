# Tool-result model content and recovery

Updated: 2026-10-01<br>
Decision: [ADR-0033](../../decisions/0033-stable-tool-result-model-content.md)<br>
Implementation: [ToolResultNormalizer](../../../src/main/agent/runtime/tools/result-normalization/ToolResultNormalizer.ts)

`ToolResultFact.content` retains the original program value. `modelContent` is the
stable, deterministic model string prepared at tool completion. It is at most
32,000 JavaScript characters, including diagnostics and recovery metadata. Small
results pass through; empty results have an explicit completion marker. Structured
failures stay before the preview. Tool timing and execution status are preserved.

Large results are saved as UTF-8 `content.txt` under the active workspace's
`.ati/artifacts/tools/<sha256>/`; extracted images use `.tmp/images/<sha256>.<ext>`.
Model content includes relative read paths and existing `read` pagination
instructions. Canonical path checks reject symlink escapes before writes.
Repeated raw content resolves to the same paths. Storage failure produces a bounded
preview with an explicit non-recoverable notice. Already-small web artifact
descriptors remain intact and do not produce duplicate artifacts.

Chat stores original display content and `toolResultModelContent` in the same
message body. Host history projection restores model content. Persisted messages without that
field are prepared once before their runtime begins. CLI and subagents use the
same normalizer with their own workspace root. Request materialization reuses
model content without age-based truncation. Terminal snapshots perform no writes.

ContextManager owns whole-request token budgeting; see [ADR-0036](../../decisions/0036-runtime-context-manager.md).
It preserves current goals, effective contexts and unconsumed assistant/tool batches, then summarizes or omits
complete optional history groups. Actual adapter body and output reserves participate. It never rewrites stored results.
Mandatory input overflow fails before dispatch. Snapshot records remain complete.

Tool-level semantic compaction is retired. Old database rows remain as historical
data and are ignored by request preparation. Conversation-level compression
continues separately. Artifact retention follows workspace retention; expiry is
not introduced. Command capture still drops output above its bounded buffers,
and those lost bytes cannot be restored by later normalization.

## Tool-owned views

Embedded tools may call `context.setModelContent()` before returning. ToolExecutor
transports that view separately from the raw result; the dispatcher adds structured
failure diagnostics. The normalizer accepts bounded views and falls back to raw
normalization when a custom view exceeds 32,000 characters. Custom views also pass
through image extraction, including base64 fields inside JSON and views prefixed
with structured failure diagnostics. Image removal preserves the tool-selected
text and tail strategy. Prepared views remain stable during history replay.

`exec` prepares its view after process completion (including timeout/nonzero exit
and partial spawn failures). stdout and stderr each retain their suffix within
12,000 JSON-serialized characters and 24,000 UTF-8 bytes. Truncation flags combine
capture and projection loss; byte counts remain the original observed counts.
Exit code, signal, timing and failure information stay in the view. Raw UI/history
content remains the bounded process capture. No complete command log is promised.

`web_fetch` returns extracted text inline within 24,000 JSON-serialized characters
and 48,000 UTF-8 bytes. Larger content stays in a single `.tmp/web-fetch/<uuid>.tmp` file.
Text files contain the readable extracted body; binary files retain downloaded
bytes. The response supplies a bounded summary and read path. There is no artifact
promotion, hash directory, metadata file or diagnostic sidecar. Both HTTP and
rendered content follow these limits. Completed files stay with the workspace;
failed or cancelled writes are removed, and completed files are not age-pruned.
The shared web
materializer also applies the byte and JSON-escaping checks to search page content.
