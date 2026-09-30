# 0029: Unified run submission and early chat identity

Status: Accepted
Date: 2026-09-30

## Context

ChatUI called `RunService.start()` while Telegram, Scheduler, and TUI called `execute()`. Both paths registered and ran an `AgentRun`, but separately owned completion errors and cleanup. For a newly created chat, preparation emitted chat and user-message events before the emitter received `chatUuid`. Telegram had no Renderer-side pending submission to associate with those events, so ChatUI could miss the inbound user message while later assistant output appeared.

## Decision

`RunService.submit(input, options)` is the sole Main entry for ordinary agent runs. It synchronously validates admission, registers and starts one run, and returns a Main-local handle with `submissionId` and `completion: Promise<RunResult>`. Completion resolves for success and rejects for failed or aborted runs. One terminal path clears pending interactions and removes the active run. A rejection observer protects callers that only use the admission receipt; callers that await `completion` still receive the rejection.

The `run:start` IPC handler validates its transport payload, calls `submit()`, and returns only `{ accepted: true, submissionId }`. Telegram, Scheduler, and TUI await `completion`; each retains its own ingress and host response behavior. The handle and its Promise never cross IPC.

The emitter receives known chat identity at run creation. `RunEnvironmentService` binds the resolved chat identity immediately after chat lookup or creation, before `chat.ready`, history, and user-message events. `AgentRun` retains the resolved UUID for active-run lookup. Main owns these event identities for all hosts.

## Consequences

Callers choose whether to wait without creating distinct run lifecycles. Early inbound messages carry the chat UUID needed by the shared Renderer ingress. The Main submission API no longer exposes `start()` or `execute()` aliases. Post-run title and compression jobs remain asynchronous to completion.

See [current chat runtime architecture](../architecture/chat-runtime-architecture-current.md) and the [implementation investigation](../work/investigations/unified-run-submission.md).
