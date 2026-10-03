# Chat Run Architecture

## Goal
Make main process the only runtime truth for chat execution. Renderer only submits a run command and projects run events into UI state.

## Core Pieces
- `RunService`
  - accepts a submission
  - prepares chat/history/messages
  - runs the multi-turn agent loop
  - emits lifecycle/message/tool events
  - schedules post-run jobs
- `AssistantTurnLoop`
  - current assistant-turn loop kernel used by `AgentRun`
  - drives `request -> stream -> tool -> next request`
- `RunEventEmitter`
  - sends `RUN_EVENT` to renderer
  - persists durable trace events for debugging
  - sends renderer projections, loaded message history, and live tool output only to IPC/sinks
- `useChatRun`
  - submits a run
  - subscribes to run events
  - updates `ChatStore`

## Event Flow
```
run.accepted
  -> run.state.changed(preparing)
  -> chat.ready
  -> messages.loaded
  -> message.created (user)
  -> message.created (assistant placeholder)
  -> run.state.changed(streaming / executing_tools / finalizing)
  -> message.updated (0..n)
  -> tool.call.detected (0..n)
  -> tool.execution.started
  -> tool.execution.output (0..n, ephemeral)
  -> tool.execution.completed / failed
  -> tool.result.attached (0..n)
  -> chat.updated
  -> run.completed | run.failed | run.aborted
  -> title.generation.* / compression.*
```

## Design Rules
- Main owns lifecycle, persistence, tool execution and post-run jobs.
- Main owns active-run identity and live cancellation through `RunRegistry`.
- Renderer never rebuilds assistant delta or tool-call state.
- Renderer `activeRuns` stores transient event subscriptions and queue metadata. Stop sends
  `RUN_CANCEL` with the selected `chatUuid`, allowing main to resolve the active run after
  renderer lifecycle loss.
- Live command output stays in bounded renderer run state keyed by chat and tool call.
- All `CHAT_RENDER_EVENTS`, `messages.loaded`, and `tool.execution.output` are transport-only. Their payloads are transient UI projections or copies of state already stored in domain tables, and `RunEventEmitter` routes them exclusively to IPC/sinks.
- Lifecycle, tool state, steering, maintenance, remaining host state, and subagent events remain durable diagnostic traces.
- `run.completed` is the boundary for restoring input state.
- title generation and compression are post-run jobs and must not block run completion.

## Key Files
- Main runtime:
  - `src/main/orchestration/chat/run/index.ts`
  - `src/main/orchestration/chat/run/runtime/DefaultMainAgentRuntimeRunner.ts`
- Shared protocol:
  - `src/shared/run/events.ts`
- Renderer projection:
  - `src/renderer/src/features/chat/runtime/useChatRun.ts`

## Pasted text attachments

Desktop input optionally carries `textAttachments` (`id`, `filename`, `text`) through
submission, pending-message rendering, queued messages and steering. The generated
filename is `pasted-text-N.txt`; Main validates attachment shape at both IPC entry points.
`src/shared/chat/textAttachments.ts` contains the thresholds and deterministic text expansion.

Main's ChatStepStore persists complete expanded text in the existing message `content`,
plus `composerText` and `textAttachments` for the compact UI and regeneration. This is
an intentional request snapshot: history import, compression and request budgeting keep
seeing the full text through their existing content paths. Renderer regeneration submits
the original composer metadata, so attachments expand exactly once. No schema migration,
provider upload, local path or remote file ID is introduced.

The host request builder and steering runtime use the same expansion for fresh user input.
Every adapter receives ordinary text. The conversion improves composer interaction; it does
not reduce context usage. Existing ContextManager budget errors remain explicit and no
attachment contents are silently truncated.

ChatInputQueueStore retains a submitted draft by run identity, adopts it when a new chat
becomes ready, and exposes it for recovery on `run.failed`. This survives the Welcome to
Chat composer remount. A blank composer recovers the draft; new edits remain in place and
the failed payload goes into the paused queue. Completion or cancellation clears the
submitted snapshot. Immediate IPC failure uses the same recovery path. Returning a
rejected first submission to the pending composer preserves its current draft and
any queue item being edited, including edits made while the request was pending.

See [ADR-0038](../decisions/0038-pasted-text-attachment-transport.md).
