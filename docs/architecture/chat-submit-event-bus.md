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
  - persists trace events for debugging
- `useChatSubmitV2`
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
  -> tool.execution.started / completed / failed
  -> tool.result.attached (0..n)
  -> chat.updated
  -> run.completed | run.failed | run.aborted
  -> title.generation.* / compression.*
```

## Design Rules
- Main owns lifecycle, persistence, tool execution and post-run jobs.
- Renderer never rebuilds assistant delta or tool-call state.
- `run.completed` is the boundary for restoring input state.
- title generation and compression are post-run jobs and must not block run completion.

## Key Files
- Main runtime:
  - `src/main/orchestration/chat/run/index.ts`
  - `src/main/orchestration/chat/run/runtime/assistant-turn/AssistantTurnLoop.ts`
- Shared protocol:
  - `src/shared/run/events.ts`
- Renderer projection:
  - `src/renderer/src/hooks/chatSubmit/index.tsx`
