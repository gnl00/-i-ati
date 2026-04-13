# Chat Run

`chatRun` is the renderer-side controller for a main-driven chat run.

Renderer responsibilities stay narrow:

- start or cancel a run through IPC
- subscribe to shared run events
- act as the run-output ingress for chat UI state
- project shared run events into committed transcript state and ephemeral preview state in `chatStore`
- track post-run UI state such as title/compression jobs

Main remains responsible for execution, persistence, and ordering.

## Files

- `useChatRun.ts`
  renderer entrypoint that starts and cancels the active run
- `chatRunEvent.ts`
  run event ingress that binds shared run events and applies them to `chatStore`
- `collectRunTools.ts`
  renderer-side tool selection before `invokeRunStart(...)`
- `reconcileRunErrorMessage.ts`
  assistant error-message cleanup after failed/completed runs
