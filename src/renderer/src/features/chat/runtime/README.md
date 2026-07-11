# Chat Run

`chatRun` is the renderer-side controller for a main-driven chat run.

Renderer responsibilities stay narrow:

- start or cancel a run through IPC
- subscribe to shared run events
- act as the run-output ingress for chat UI state
- project shared run events into committed transcript state and ephemeral preview state in `chatStore`
- track post-run UI state such as title/compression jobs

Main remains responsible for execution, persistence, and ordering.

`invokeRunStart` uses `modelRef` for the MainAgent chat-selected execution model. `chatModelRef` carries the same persisted chat model for desktop chat runs, while image understanding is handled by the VisionObservation sidecar during main-process preparation.

Image sends use two display paths for fast feedback:

- `useChatRun` creates a pending user message when the submission has text or media, including pure image sends.
- Main preparation emits `CHAT_READY` first, then emits the persisted visible user image message immediately after `StepBootstrapService` saves it. The later hidden vision observation arrives through the normal committed message path.

## Files

- `useChatRun.ts`
  renderer entrypoint that starts and cancels the active run
- `chatRunEvent.ts`
  run event ingress that binds shared run events and applies them to `chatStore`
- `collectRunTools.ts`
  renderer-side tool selection before `invokeRunStart(...)`
- `reconcileRunErrorMessage.ts`
  assistant error-message cleanup after failed/completed runs
