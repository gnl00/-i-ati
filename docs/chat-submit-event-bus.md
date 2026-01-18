# Chat Submit Event-Bus (Overview)

## Goal
Decouple chat submission business logic from UI updates by routing all state changes through a submission-scoped event bus. This makes streaming/tool handling deterministic and easier to debug or test.

## Core Pieces
- `ChatSubmitEventBus` - ordered, per-submission event queue.
- `ChatSubmissionService` - orchestrates session -> request -> streaming -> finalize.
- Services:
  - `SessionService` (prepare workspace/chat, load history)
  - `MessageService` (persist/update messages, tool results)
  - `RequestService` (build API request)
  - `StreamingService` (orchestrate streaming + tools)
  - `FinalizeService` (title, persistence, compression)
- `SubmissionContext` - shared in-memory state for a single submission.

## Event Flow (Simplified)
```
submission.started
  -> session.ready
  -> messages.loaded
  -> message.created (user)
  -> message.created (assistant placeholder)
  -> request.built
  -> stream.started
     -> stream.chunk (0..n)
     -> tool.call.detected (0..n)
     -> tool.call.flushed (0..n)
     -> tool.call.attached (0..n)
     -> tool.exec.started / completed / failed
     -> tool.result.attached (0..n)
     -> tool.result.persisted (0..n)
  -> stream.completed
  -> chat.updated
  -> submission.completed
```

## Ordering Guarantees
- Events are dispatched sequentially per submission.
- No cross-run interleaving (each submission uses its own bus).
- Tool calls are flushed to assistant messages before tool execution results are emitted.
- Tool result messages are attached before persistence notifications are emitted.

## Event Trace Recording
Key lifecycle events (excluding `stream.chunk`) are persisted to the database via `ChatSubmitEventTraceRecorder`. This enables post-mortem debugging without high-volume chunk logging.

## UI Hook-up
`useChatSubmitV2` subscribes to events and updates:
- `ChatContext` (chatId, chatUuid, title, list)
- `ChatStore` (messages, fetch/stream flags, request controller)

Feature flag: `useEventDriven` in `src/renderer/src/hooks/chatSubmit/index.tsx`.

## Key Files
- Event bus + types:
  - `src/renderer/src/hooks/chatSubmit/event-driven/bus.ts`
  - `src/renderer/src/hooks/chatSubmit/event-driven/events.ts`
- Orchestrator:
  - `src/renderer/src/hooks/chatSubmit/event-driven/submission-service.ts`
- Default services:
  - `src/renderer/src/hooks/chatSubmit/event-driven/services/*.ts`
- UI wiring:
  - `src/renderer/src/hooks/chatSubmit/index.tsx`

## Migration Notes
- Legacy pipeline (prepare/buildRequest/streaming index/finalize/machine/container/message-manager) is removed.
- Streaming core logic lives under `src/renderer/src/hooks/chatSubmit/event-driven/streaming/*`.
- Update any internal references to old files before reusing archived docs.
