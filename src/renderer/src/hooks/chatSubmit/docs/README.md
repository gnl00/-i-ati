# Chat Submit (Event-Bus)

Chat submission now runs entirely through an event-bus pipeline. The hook subscribes to events and updates UI state; services emit events and handle business logic only.

## Flow Summary
```
submission.started
  -> session.ready
  -> messages.loaded
  -> message.created (user)
  -> message.created (assistant placeholder)
  -> request.built
  -> stream.started
     -> stream.chunk (0..n)
     -> tool.call.detected / tool.call.flushed / tool.call.attached
     -> tool.exec.started / completed / failed
     -> tool.result.attached / tool.result.persisted
  -> stream.completed
  -> chat.updated
  -> submission.completed
```

## Key Files
- Event bus + contracts:
  - `src/renderer/src/hooks/chatSubmit/event-driven/bus.ts`
  - `src/renderer/src/hooks/chatSubmit/event-driven/events.ts`
- Orchestrator:
  - `src/renderer/src/hooks/chatSubmit/event-driven/submission-service.ts`
- Services:
  - `src/renderer/src/hooks/chatSubmit/event-driven/services/*.ts`
- UI wiring:
  - `src/renderer/src/hooks/chatSubmit/index.tsx`

## Further Reading
- `docs/chat-submit-event-bus.md`

## Event Trace
Key lifecycle events are persisted (excluding `stream.chunk`) for debugging.

## Main-driven Mode
Main-process streaming is always enabled. The renderer consumes `chat-submit:event` and only updates UI.
