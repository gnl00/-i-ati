# Stop Boundary Runtime Context

## Goal

When a user stops an active run, the next model request needs a stable boundary between the stopped task and the next user request. The boundary prevents the model from treating consecutive user messages as one unfinished task queue.

## Message Contract

Stop boundary messages are hidden assistant messages:

```ts
{
  role: 'assistant',
  source: MESSAGE_SOURCE.RUN_STOPPED,
  content: '<run_boundary status="stopped" reason="user_cancelled">...</run_boundary>',
  runBoundary: {
    status: 'stopped',
    reason: 'user_cancelled',
    submissionId,
    stoppedAt
  },
  segments: [],
  typewriterCompleted: true
}
```

The message is hidden from chat UI and search through `HIDDEN_MESSAGE_SOURCES`, but it remains part of history and compression input.

## Runtime Semantics

- Every aborted run appends one stop boundary.
- If the aborted run has a persistable partial assistant message, the partial assistant is saved first and the boundary follows it.
- If the aborted run has no persistable assistant message, the boundary directly follows the user message that started the run.
- Repeated abort handling for the same `submissionId` reuses the existing boundary message.

## Context Order

The next canonical runtime context should look like:

```text
user: previous request
assistant/tool: optional partial run artifacts
assistant source=run_stopped: <run_boundary status="stopped" ...>
user: next request
```

Context carrier messages keep their own `source` values and remain distinct from real user input:

```text
user source=compression_summary
historical messages after compression
user source=system_environment_context
user source=skills_context
user source=knowledgebase_context
user source=awake_context
user: current real input
```

## Compression

Compression should preserve the fact that a run was stopped. The exact XML boundary can be summarized, but the summary must keep the stopped-run state and the related user request when it matters for follow-up intent.
