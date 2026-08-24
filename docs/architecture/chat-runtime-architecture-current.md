# Chat Runtime Architecture Current

## Current structure

The chat runtime uses four cooperating boundaries:

- `src/main/agent/runtime/`: provider-independent loop, step, transcript, model,
  and tool execution.
- `src/main/hosts/chat/`: chat preparation, persistence, mapping, rendering, and
  finalization.
- `src/main/orchestration/chat/run/`: active-run lifecycle, cancellation,
  confirmation, paused user questions, and runtime assembly.
- `src/main/orchestration/chat/maintenance/` and `postRun/`: explicit maintenance
  operations and asynchronous completion jobs.

```text
RunService
  -> RunRuntimeFactory
    -> RunManager
      -> AgentRun
        -> ChatAgentAdapter.prepareRun()
        -> DefaultMainAgentRuntimeRunner
          -> AgentRuntime
        -> RunFinalizer
        -> ChatAgentAdapter.finalizeRun()
        -> PostRunJobService
```

## Agent runtime

`src/main/agent/runtime/` owns the execution kernel. Its contracts are exposed
from `src/main/agent/contracts/`, including run inputs/results, confirmation,
conversation persistence, message event sinks, and run-event interfaces.

The runtime consumes host-neutral request specifications and tool execution
facts. Chat entities, renderer state, and Electron event transport stay outside
the kernel.

### Empty terminal response recovery

Provider stream chunks may omit `finish_reason`, including every emitted chunk
before `[DONE]`. The OpenAI-compatible adapters preserve that absence through
the normalized stream contract, so the runtime can distinguish an explicit
terminal reason from an in-progress delta.

`AgentLoop` treats a completed provider stream as incomplete when its step has
zero tool calls and no trimmed user-visible text. It retries the same transcript
once without materializing the incomplete step or appending it to the
transcript. A second incomplete response produces the
`INCOMPLETE_MODEL_RESPONSE` failure result. The run finalizer therefore follows
the failure path and leaves earlier assistant drafts untouched. Tool-call steps,
explicit text responses, and steering behavior retain their existing loop
semantics.

The completed investigation record is
[agent-loop-empty-terminal-response-recovery-2026-08-04.md](../archive/2026/chat/agent-loop-empty-terminal-response-recovery-2026-08-04.md).

## Chat host

`src/main/hosts/chat/ChatAgentAdapter.ts` coordinates chat-specific behavior:

- `config/`: application and model context lookup;
- `preparation/`: request, prompt, skill, compression, and step bootstrap;
- `persistence/`: chat session and step stores;
- `mapping/`: chat/runtime event mapping;
- `runtime/`: renderer output and tool side effects;
- `finalize/`: terminal chat persistence.

Host modules depend on `RunEventEmitter` from
`src/main/agent/contracts/RunEvents.ts`. The concrete event implementation stays
inside orchestration infrastructure.

## Run orchestration

`src/main/orchestration/chat/run/index.ts` exposes start, execute, cancellation,
confirmation, user-question submission and hydration, and active-run
configuration updates.

Key implementation files:

- `runtime/RunManager.ts`: active run entry and registry coordination;
- `runtime/AgentRun.ts`: one run lifecycle;
- `runtime/RunRuntimeFactory.ts`: local composition root;
- `runtime/DefaultMainAgentRuntimeRunner.ts`: bridge into `AgentRuntime`;
- `runtime/RunFinalizer.ts`: terminal result mapping;
- `infrastructure/event-emitter.ts`: Electron transport and trace persistence;
- `infrastructure/tool-confirmation.ts`: confirmation state.
- `infrastructure/tool-question.ts`: pending structured questions, validated
  answers, cancellation, and recommended-answer timeout resolution.

The mutable runtime context currently carries `permissionApprovalMode`. Renderer
updates reach the active run through `run:permission-approval-mode:update`.
Pending confirmation is released when the updated mode permits automatic
execution, and the event stream records the mode change.

`ask_user_question` uses a separate `ToolQuestionManager`. The manager emits a
required event, waits on a keyed Promise, validates the renderer submission,
and returns the answer as the tool result for the next model step. A bounded
timeout selects the validated recommendations with an `auto_submitted` status.
The dispatcher treats the question as a batch interaction barrier and defers
later calls until the model has consumed that result. Pending interactions can
be listed by chat UUID so renderer remounts recover the active form.

## Maintenance and post-run work

Explicit operations live in `src/main/orchestration/chat/maintenance/`:

- `CompressionExecutionService.ts`
- `TitleGenerationService.ts`
- `MessageCompressionService.ts`

Asynchronous completion jobs live in `src/main/orchestration/chat/postRun/`:

- `PostRunJobService.ts`
- `TitleJobService.ts`
- `CompressionJobService.ts`

The main run emits `run.completed` before title and compression jobs continue.
These jobs preserve the main run completion boundary.

## Chat branch snapshots

The `chat:fork` IPC operation creates an independent Chat from a persisted
terminal assistant message. `ChatBranchRepository` owns one immediate SQLite
transaction that validates the source identity and boundary, creates the
destination Chat, and physically copies the selected message prefix with fresh
autoincrement IDs. The transaction also syncs message search, copies loaded
skills and work context, and stores `parentChatUuid`,
`forkedFromMessageId`, and `forkedAt` lineage on the destination.

The largest compressed summary fully contained in the selected prefix becomes
one fresh active summary whose membership references destination message IDs.
Prefixes without a compatible summary retain raw copied history. Ready
tool-result compactions whose raw SHA-256 hash still matches are copied to the
fresh destination tool-message IDs. Message bodies retain provider protocol
identity such as `toolCallId`.

Renderer receives the new Chat and copied messages as one snapshot. The chat
coordinator adds it to the ordinary Chat list, restores its transcript buffer,
selects its saved model, and moves the shell to the branch. Subsequent request
preparation uses the existing summary and compact-result lookup paths. See
[ADR-0016](../decisions/0016-physical-chat-branch-snapshots.md).

## Tool-result compaction

Embedded tool metadata can declare `resultCompaction` with an enabled flag,
level, and compactor ID. `web_fetch` declares the `balanced` level with the
`web-document` compactor. `exec` declares the `balanced` level with
the `command-output` compactor. Both profiles use a 1,000-character semantic
content budget; the reserved `minimal` level uses 500 characters.

`ChatRenderOutput` persists the raw tool result, emits that raw message to the
renderer, and invokes its injected `ToolResultCompactionTrigger`. It then
returns the same raw content to the tool-completion event. Synchronous
scheduling failures produce a structured warning while raw persistence and
continuation remain available. `RunRuntimeFactory` wires the production
`ToolResultCompactionScheduler` into this narrow host contract. This keeps the
chat render modules loadable in Node runtimes while orchestration owns the
embedded-tool, database, compactor, and Electron dependency graph.

The default transcript record factory appends the original `ToolResultFact` to
the active run. The immediate continuation therefore receives the complete raw
content. Later steps in that active run use the same in-memory transcript
snapshot and retain the existing cold projection behavior for older results.

`web_search` and `web_fetch` also protect the active hot continuation at the
tool boundary. Direct responses spool into the active workspace. Completed
files above 3 MiB, non-text files, and extracted text above the inline budget
become workspace artifacts, and the immediate result carries a bounded
descriptor. Non-text artifacts preserve the original source for a suitable
workspace file tool. The embedded `read` tool consumes artifact `content.md`
notes and extracted text in line windows with a 32,000-character ceiling and
line/column continuation coordinates. See
[ADR-0011](../decisions/0011-size-based-web-fetch-workspace-artifacts.md).

The scheduler reads registered tool metadata and places configured jobs into a
bounded FIFO queue. One job runs at a time, eight jobs may wait, and the first
drain starts through `setImmediate`. Identity-keyed singleflight shares queued
or running work. Queue overflow emits `tool_result.compaction.queue_full` and
leaves the persisted raw message available for future replay. Compactor output
with positive size gain becomes a ready derived row for later runs.
`WebFetchResultCompactor` sends the fetched body to the reusable `CompactAgent`,
which uses the configured lite model for semantic extraction. The compactor
then restores provider-neutral URL, title, status, source, citation, and
truncation fields. `ExecuteCommandResultCompactor` sends attributed stdout and
stderr to the same agent. It restores command, exit code, execution time,
error, confirmation, and risk fields around an `output_summary` that retains
failure evidence, test totals, warnings, paths, locations, artifacts, and next
steps. Balanced model input is bounded to 12,000 characters and minimal input
to 6,000 characters before dispatch. Dynamic URL, title, command, status, and
result fields stay inside a structured untrusted-source envelope. Tool metadata
declares whether model input uses secret redaction or verbatim forwarding.
The model request uses a 20-second default timeout, follows the parent run
abort signal, and caps generated tokens at the semantic character budget.
Model errors, timeouts, and empty output select the local head-tail compactor.
Disabled policies, unavailable compactors, zero-gain output, and exhausted
compaction paths resolve to raw content. Shared sensitive-text redaction also
protects request debug logs. Job state, execution type, model identity, prompt
version, token usage, latency, input size, sent size, truncation state,
redaction count, and ready content are stored in
`tool_result_compactions`, while `messages.body` retains the raw source.

During the next submitted-run preparation, `RunRequestFactory` performs one batch
lookup for ready compactions associated with tool messages still present in the
request. It reloads those persisted tool messages as the raw source. Shared
selection helpers filter results through the current metadata configuration,
validate the raw SHA-256 hash, and choose the newest compactor version by
persisted message ID. `InitialTranscriptSeedBuilder` wraps selected content in
a JSON representation shaped as `compacted/lossy/result`. Valid JSON compact
payloads remain structured under `result`; text payloads become JSON string
values. The complete serialized representation must remain shorter than the
persisted raw content, stay within 32,000 characters, and contain no inline
image data. Eligible seeds carry the trusted internal
`contentRepresentation: semantic_compaction` sidecar through transcript
materialization. `RequestMaterializer` uses this provenance to preserve the
complete semantic JSON through historical replay. Raw historical tool results
continue through the 1,000-character cold replay guard, which retains the
first 700 and final 300 source characters around a visible omission marker.
`tool_result_compactions.content` keeps the bare provider-neutral compact
payload, and the request assembly boundary owns the representation envelope.
Renderer live events, `ChatSessionStore` history, and renderer message IPC all
use raw persisted content. Database updates preserve raw tool content. Ready
lookups deduplicate IDs and query in batches of 500. Raw fallback continues
through the existing cold replay guard in `RequestMaterializer`.

Compaction identity uses message ID, level, compactor ID, compactor version, and
raw hash. Database claim transitions permit `pending|failed -> running`;
terminal writes require the running claim. The scheduler reuses an in-process
singleflight promise and an existing ready row for the same identity.

## Dependency direction

```text
orchestration/run -> hosts/chat -> agent contracts
orchestration/run -> agent/runtime -> agent contracts
hosts/chat -> db domain facades
event-emitter implementation -> run-event db facade + Electron window
```

`RunRuntimeFactory` remains a local composition root for the complex run path.
The process-wide IPC and tool registries remain explicit central registries.
