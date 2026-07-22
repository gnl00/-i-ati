# ADR-0009: Background tool-result compaction

**Status:** Accepted<br>
**Date:** 2026-07-21<br>
**Related architecture:** [Chat runtime architecture](../architecture/chat-runtime-architecture-current.md)<br>
**Related work:** [Background tool-result compaction](../work/plans/background-tool-result-compaction.md)<br>
**Supersedes:** Active-result resolution decisions in [Tool result compaction design](../work/plans/tool-result-compaction-design.md)

## Context

The chat host persists a raw tool message and then awaits semantic compaction
inside `ChatRenderOutput.appendToolResult()`. The tool-completion event remains
open during that request because the event bus and host render forwarder await
each sink. The agent loop starts its continuation only after the compact agent
returns or reaches its timeout.

Runtime logs from 2026-07-21 recorded two 45,541-character `web_fetch`
results. Their compact-agent calls took 8,953 ms and 20,008 ms. The main model
request started immediately after each compaction reached `ready`. Compaction
latency therefore sits on the active tool execution path.

Raw tool messages already live in `messages.body`. Ready compact results live
in `tool_result_compactions`. Request preparation already batch-loads ready
rows, checks the configured compactor, validates the raw SHA-256 hash, and
selects the newest matching compactor version by persisted message ID.

## Decision

The active agent run uses the full raw tool result. Semantic compaction runs as
a background derived-cache job after raw persistence.

```text
tool execution
  -> persist raw messages.body
  -> emit raw renderer message
  -> append raw hot transcript record
  -> enqueue background compaction
  -> continue the active agent loop with full raw content

background queue
  -> yield through setImmediate
  -> compact and persist derived content

next submitted run
  -> load raw history
  -> batch-load ready tool_result_compactions
  -> validate metadata, version, and original hash
  -> wrap matching compact content for the model transcript
```

The active run keeps one stable transcript snapshot. Its immediate
continuation receives the full raw result. Later steps in the same run keep
the existing cold-replay projection for older tool results. A new submitted
run performs the next database selection.

Renderer reads return raw persisted messages. Compact rows are model-facing
derived data and stay inside request preparation.

Request assembly marks selected semantic compaction with a provider-neutral
JSON representation:

```json
{
  "compacted": true,
  "lossy": true,
  "result": {}
}
```

`tool_result_compactions.content` stores the bare compactor payload. During a
future submitted-run build, `InitialTranscriptSeedBuilder` parses valid JSON
payloads into `result` and preserves text payloads as JSON strings. The complete
serialized representation must remain shorter than the persisted raw tool
content, stay within 32,000 characters, and contain no inline image data.
Eligible transcript seeds and records carry the internal trusted provenance
sidecar `contentRepresentation: semantic_compaction`. This sidecar preserves
the complete semantic JSON through request materialization. Raw historical
results continue through the 1,000-character cold replay guard, which retains
the first 700 and final 300 source characters around a visible omission marker.
Active-run model content and renderer content remain byte-equivalent raw
payloads.

The chat host depends on a narrow scheduling contract. It schedules a job and
returns the raw result without waiting for compact content. The production
scheduler owns a bounded FIFO queue with one active worker and eight waiting
jobs. Queue draining begins through `setImmediate` so the active continuation
can dispatch first. Existing database identity keys and in-process
singleflight protect duplicate work.

The active continuation uses the complete raw result with no character guard.
Tool-level fetch and command limits remain the upstream bounds. Provider
context overflow is an accepted consequence of this contract and remains
visible as a model-request failure.

## Consequences

- Compact-agent latency leaves the active tool-result critical path.
- The active model sees the exact tool output persisted in `messages.body`.
- New runs reuse ready semantic compact content through the existing batch
  selector and receive an explicit lossy-representation marker.
- Representation overhead participates in positive-size-gain selection.
- Compact rows remain reusable provider-neutral payloads in the database.
- Renderer output remains stable across live delivery and history reload.
- Pending, failed, missing, stale-hash, and stale-version rows select raw cold
  replay through the existing request guard.
- Queue overflow records a structured warning and leaves the raw message as
  the available source.
- Process exit can leave a queued job absent or a running row unfinished.
  Future requests remain usable through raw fallback.
- Large raw results can exceed a provider context window during the immediate
  continuation.

## Verification

- A delayed compact promise leaves `host.tool.result.available` free to
  complete and allows the next main-model request to start.
- The live renderer event and hot transcript contain the persisted raw value.
- A completed background job writes a ready compact row.
- A new run selects a ready row whose metadata and raw hash match.
- A selected ready row receives one `compacted/lossy/result` envelope during
  request assembly.
- JSON and text compact payloads retain their value inside `result`.
- Representation overhead that consumes the size gain selects persisted raw
  content.
- Semantic envelopes above 32,000 characters or containing inline image data
  select persisted raw content.
- Trusted semantic envelopes remain intact during historical replay. Raw
  historical results retain the 1,000-character request guard with 700 head
  and 300 tail source characters.
- The same run keeps its existing transcript snapshot after the background job
  becomes ready.
- Renderer IPC history reads return raw content.
- Queue concurrency stays at one and queue depth stays at or below eight.
- Queue overflow, compactor failure, and aborted jobs preserve raw replay.
