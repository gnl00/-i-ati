# Background Tool Result Compaction

Owner: Repository maintainers<br>
Status: Approved<br>
Started: 2026-07-21<br>
Target: Full raw tool results for the active continuation and background compact results for future runs<br>
Exit criteria: The active loop has no compact-agent wait, renderer reads stay raw, future runs select ready compact rows, focused tests and architecture checks pass.<br>
Related decision: [`../../decisions/0009-background-tool-result-compaction.md`](../../decisions/0009-background-tool-result-compaction.md)<br>
Related design: [`tool-result-compaction-design.md`](tool-result-compaction-design.md)<br>

## Goal

Move semantic tool-result compaction out of the active agent-loop critical
path. Persist raw content first, continue the current run with that full raw
content, and build a compact cache in the background for future submitted
runs.

## Approved semantics

1. `messages.body` remains the raw source of truth.
2. The immediate model continuation receives the full raw tool result.
3. The active run keeps a stable in-memory transcript after the result is
   appended.
4. Background jobs write derived content to `tool_result_compactions`.
5. The next submitted run batch-loads ready compact rows during request
   preparation.
6. Renderer live events and renderer history reads use raw persisted content.
7. Full raw delivery has no character guard in the hot replay path.

`next submitted run` means a new desktop submission, schedule execution,
Telegram submission, or another host invocation that rebuilds the initial
transcript. It does not mean a later model step inside the same active run.

## Current blocking path

```text
DefaultToolExecutorDispatcher.executeCall()
  -> await emitToolExecutionCompleted()
  -> DefaultAgentEventBus.emit()
  -> HostRenderEventForwarder.handle()
  -> await ChatRenderResponder.handle()
  -> await ChatRenderOutput.appendToolResult()
  -> await ToolResultContentResolver.resolve()
  -> compact-agent request
  -> active loop continues
```

`ToolResultCompactionScheduler.schedule()` already starts detached work, while
`RunRequestFactory` already performs the required future-run batch lookup and
hash validation. The implementation should connect these existing paths and
remove active-result resolution.

## Target runtime flow

```text
ToolResultFact(raw)
  -> project raw content for display
  -> persistToolResultMessage(raw)
  -> append raw MessageEntity to the run message buffer
  -> emit raw tool-result renderer event
  -> schedule background compaction
  -> return raw content to the tool-completion event
  -> append the original ToolResultFact to the hot transcript
  -> materialize the next provider request with full raw content

background worker
  -> metadata policy lookup
  -> identity and singleflight lookup
  -> pending/running database transitions
  -> compact-agent or deterministic compactor
  -> ready/failed database transition

future run preparation
  -> load raw MessageEntity history
  -> retain request-visible tool message IDs
  -> batch-load ready compact rows
  -> reload persisted raw tool messages
  -> validate originalHash
  -> select configured compactor and newest version
  -> seed compact content into the initial model transcript
```

## Runtime contracts

### Host scheduling port

Replace the active content-resolution port with a scheduling-only port under
the chat host runtime boundary:

```ts
export interface ToolResultCompactionTrigger {
  schedule(input: {
    messageId: number
    result: ToolResultFact
    rawContent: string
    args?: unknown
    signal?: AbortSignal
  }): void
}
```

Provide a no-op implementation for isolated host and Node integration tests.
`RunRuntimeFactory` injects the production scheduler through this contract.
The host package keeps type-only knowledge of the port and avoids loading the
orchestration, database, embedded-tool, or Electron graph.

### Active transcript

Remove `ToolResultResolutionStore` and
`ResolvedToolResultTranscriptRecordFactory`. The default transcript record
factory writes the original `ToolResultFact`. `ChatRenderOutput` keeps the raw
`MessageEntity` unchanged after persistence and returns raw content to the
outer tool event.

### Background scheduler

Keep compaction execution inside `DefaultToolResultCompactionScheduler`.
Scheduling has these rules:

- FIFO ordering;
- one active job;
- eight waiting jobs;
- drain startup through `setImmediate`;
- duplicate queued or running identities share one job;
- queue overflow emits `tool_result.compaction.queue_full` with message ID,
  tool name, tool call ID, and queue depth;
- every detached promise terminates inside the scheduler error boundary;
- caller abort signals continue into the compactor;
- existing pending, running, ready, failed, size-gain, model fallback, and
  execution-metadata behavior remains intact.

The scheduler exposes scheduling behavior to production callers. Internal
execution helpers may return a resolution for unit-test assertions, while the
chat runtime has no content-resolution dependency.

## History and renderer ownership

`RunRequestFactory` remains the only model-history compact selector. Preserve
its persisted raw reload, metadata filtering, original-hash validation,
message-ID identity, compactor-version ordering, and 500-ID DAO batching.

`ChatSessionStore.loadHistoryMessages()` returns raw database messages.
Renderer message IPC handlers return raw database messages. Remove renderer
uses of `resolvePersistedToolResultMessages()`. Keep the pure selector helpers
used by `RunRequestFactory`; remove overlay helpers after their final caller is
gone.

The request materializer keeps its current replay behavior:

| Position | Model content |
| --- | --- |
| Immediate continuation after a tool result | Full raw hot content |
| Older tool result inside the same active run | Existing cold projection |
| Tool result in a new run with a matching ready row | Compact content |
| Tool result in a new run with pending, failed, missing, or stale compact state | Raw cold fallback |

## Failure behavior

- Raw persistence and raw continuation remain independent from scheduler
  availability.
- A synchronous scheduling exception is contained by `ChatRenderOutput` and
  logged without changing the raw result.
- Model errors, timeouts, and empty compact output keep the existing
  deterministic compactor path.
- Queue overflow leaves the message eligible for raw historical replay.
- An application exit may leave background work incomplete. Ready-only
  selection protects future requests.
- A user abort reaches queued or running jobs through the parent signal.
- Hash mismatch, compactor policy changes, and compactor version changes keep
  stale content out of model history.

## Implementation sequence

Ship this change as one coherent phase. Splitting the active raw path from
renderer ownership would create different live and reloaded content.

1. Replace `ToolResultContentResolver` with the scheduling-only host port.
2. Update `ChatRenderOutput` to persist, emit, schedule, and return raw content
   without awaiting compaction.
3. Remove the run-scoped resolution store and use the default transcript record
   factory in `DefaultMainAgentRuntimeRunner`.
4. Update runtime factory injection and isolated runtime test fixtures.
5. Add the bounded scheduler queue and queue observability.
6. Return raw history from `ChatSessionStore` and renderer message IPC.
7. Remove unused renderer overlay helpers and their obsolete tests.
8. Preserve and extend request-preparation tests for ready, pending, stale-hash,
   version, and repeated-tool-call-ID selection.
9. Synchronize the active design and chat runtime architecture documents.

The working tree already contains command-streaming changes in
`ChatRenderResponder` and `ExecuteCommandResultCompactor`. Preserve the
`host.tool.execution.output` branch and all command-result fields. Apply narrow
patches around tool-result completion and scheduler wiring.

## Expected file groups

Runtime host:

- `src/main/hosts/chat/runtime/ChatRenderOutput.ts`
- `src/main/hosts/chat/runtime/ChatRenderResponder.ts`
- the scheduling-only port under `src/main/hosts/chat/runtime/`
- `src/main/hosts/chat/runtime/index.ts`
- `src/main/orchestration/chat/run/runtime/DefaultMainAgentRuntimeRunner.ts`
- `src/main/orchestration/chat/run/runtime/RunRuntimeFactory.ts`

Compaction:

- `src/main/orchestration/chat/toolResultCompaction/ToolResultCompactionScheduler.ts`
- `src/main/orchestration/chat/toolResultCompaction/ToolResultCompactionOverlay.ts`

History and renderer:

- `src/main/hosts/chat/persistence/ChatSessionStore.ts`
- `src/main/hosts/chat/preparation/RunRequestFactory.ts`
- `src/main/ipc/messages.ts`

Tests and documentation follow the nearest existing suites and current
architecture files.

## Verification

### Focused behavior

- Hold the compact promise open and confirm that the responder returns raw
  content before that promise settles.
- Confirm the tool-completion renderer event carries raw content.
- Confirm the next request in the active run carries full raw content.
- Settle the compact job and confirm a ready row is written.
- Build a new run and confirm it selects the matching ready compact row.
- Confirm a ready row appearing during an active run does not mutate that run's
  transcript.
- Confirm renderer IPC returns raw content after a ready row exists.
- Schedule ten jobs and confirm one active job, eight waiting jobs, and one
  queue-full warning.
- Confirm duplicate identities execute once.
- Confirm scheduler errors and queue overflow leave the active raw result
  usable.

### Commands

```bash
pnpm test:run \
  src/main/hosts/chat/runtime/__tests__/ChatRenderResponder.test.ts \
  src/main/orchestration/chat/toolResultCompaction/__tests__/ToolResultCompactionScheduler.test.ts \
  src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts \
  src/main/orchestration/chat/run/runtime/__tests__/DefaultMainAgentRuntimeRunner.integration.test.ts \
  src/main/orchestration/chat/run/runtime/__tests__/RunRuntimeFactory.test.ts \
  src/main/ipc/__tests__/messages.test.ts
pnpm run typecheck:node
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
git diff --check
```

## Scope boundary

This phase keeps the existing database schema, compactor profiles, compact
prompts, metadata policies, cold replay limit, and ready-row selection rules.
Startup recovery, stale-running cleanup, multi-level compaction, and mid-run
database refresh remain separate work.
