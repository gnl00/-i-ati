# ADR-0036: Runtime ContextManager owns context and request budget

Status: Accepted
Date: 2026-10-01

## Context

Character ceilings treated model context tokens as characters and protected large restored tool groups forever.
A short follow-up could fail locally despite a million-token window. RequestMessageBuilder, initial seeds and
live transcript materializers duplicated representations and spread retention decisions across lifecycle stages.

## Decision

Replace that internal chain with Host ChatMessage[] projection, one ContextRecord[] mapping, and one per-run
ContextManager. Manager owns append/prepare/snapshot, token budgets, history selection and run-local summaries.
Every initial model call and continuation uses the same gate. No legacy internal API compatibility is retained.

Count the actual adapter/extensions/overrides body, reserve effective output limits, and include system/tools.
Use a shared tokenizer; unknown models and bounded chunk counts are explicit estimates with larger margin.
Default unknown window is 32,768. Output default is min(8,192, 20%window); margins are 5%known / 15%estimated.

Pin current user goal and steering, explicit user rules, latest effective contexts, and the complete unconsumed
assistant/tool batch. Validate one result per unique call ID and matching step ID. A successful next step
consumes the preceding batch; failure/cancellation does not. Completed older groups are optional history.

If optional history overflows, try one compactContext call and recount. Disabled/failed/empty/nonshrinking or
oversized compaction falls back to omission. Oversized compaction input is rejected without provider dispatch.
Cancellation propagates. Mandatory overflow remains explicit. Never trim individual stable modelContent.

Host keeps database/UI ownership and persistent summaries; manager summaries are run-local. Background
summary prewarming shares the compactor and retains the latest visible turn, using tokenized model content.
Existing summary lock coordinates same-chat background writers; manager never competes for those writes.

## Consequences

Delete initial seed and live transcript materializer/appender/snapshot services. Chat, CLI and subagents use
one manager. Terminal snapshots copy the complete raw record array; CLI transcript artifacts remain full evidence.
No new assistant body steps, database tables or destructive storage migration. Existing raw/model content,
recovery paths, branch history and summaries continue to load through the native Host projection.

Serialized-body counts and estimated tokenizers do not promise provider-exact usage. Long continuous blobs
are counted in bounded segments to keep UI/event-loop latency bounded; chunk counts reserve 15%margin.
Current image handling retains vision observation policy and does not implement arbitrary image billing formulas.
A mandatory tool batch may still exceed the window and produce an explicit failure.

Implementation: [Context architecture](../architecture/agent-runtime/context/README.md).
This supersedes only the request-budget section of [ADR-0033](0033-stable-tool-result-model-content.md).
