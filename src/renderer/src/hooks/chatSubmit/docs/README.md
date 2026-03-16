# Chat Submit

Chat submit now uses a main-driven run architecture. Renderer sends one submit command, then only consumes `chat-run:event` and projects those events into store state.

## Flow Summary
```
run.accepted
  -> run.state.changed(preparing)
  -> chat.ready
  -> messages.loaded
  -> message.created (user)
  -> message.created (assistant placeholder)
  -> run.state.changed(streaming / executing_tools / finalizing)
  -> message.updated (0..n)
  -> tool.call.detected / tool.exec.started / tool.exec.completed / tool.exec.failed
  -> tool.result.attached
  -> chat.updated
  -> run.completed | run.failed | run.aborted
  -> title.generate.* / compression.*
```

## Key Files
- Main runtime:
  - `src/main/services/chatRun/index.ts`
  - `src/main/services/agentCore/execution/AgentStepLoop.ts`
- Shared protocol:
  - `src/shared/chatRun/events.ts`
- Renderer hook:
  - `src/renderer/src/hooks/chatSubmit/index.tsx`

## Further Reading
- `docs/architecture/chat-submit-event-bus.md`
