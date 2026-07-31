# Chat Run

`chatRun` is the renderer-side controller for a main-driven chat run.

Renderer responsibilities stay narrow:

- start, steer, or cancel a run through IPC
- subscribe to shared run events
- act as the run-output ingress for chat UI state
- project shared run events into committed transcript state and ephemeral preview state in `chatStore`
- track post-run UI state such as title/compression jobs

Main remains responsible for execution, persistence, and ordering.

`useChatRun().steer(...)` binds a queued message to the active `submissionId`
and `chatUuid`. The renderer runtime registry owns active handles across
composer remounts, including the Welcome-to-transcript transition. Main accepts
the item into the active run's FIFO and consumes one item at the next stable
checkpoint that has budget for a continuation step. Queue payload, paused state,
and the current editing item live in a feature-owned store keyed by `chatUuid` or
the pending `submissionId`. `chatRunEvent` routes events through the active-run
lifetime, including intervals where the composer is remounting. Renderer queue
state follows two shared events:

- `run.steering.consumed` removes the matching `queueItemId` after the inserted
  user message has been persisted.
- `run.steering.returned` restores pending or in-flight item ids when a run
  terminates before consumption is acknowledged.

Main emits returned ids before the terminal lifecycle event, so the active-run
subscription restores inserting items before its lifecycle cleanup runs.

The pending submission owner migrates to the resolved chat owner when run events
first carry a `chatUuid`. Chat switches select the corresponding owner, preserving
each conversation's queued payload independently.

`invokeRunStart` uses `modelRef` for the MainAgent chat-selected execution model. `chatModelRef` carries the same persisted chat model for desktop chat runs, while image understanding is handled by the VisionObservation sidecar during main-process preparation.

Image sends use two display paths for fast feedback:

- `useChatRun` creates a pending user message when the submission has text or media, including pure image sends.
- Main preparation emits `CHAT_READY` first, then emits the persisted visible user image message immediately after `StepBootstrapService` saves it. The later hidden vision observation arrives through the normal committed message path.

Steered image messages follow the same image-understanding contract at a stable
checkpoint: the visible user message is persisted once, the VisionObservation
sidecar produces a hidden observation, and the next provider request receives
the observation text with raw image parts removed.

## Files

- `useChatRun.ts`
  renderer entrypoint that starts, steers, and cancels the active run
- `chatRunEvent.ts`
  run event ingress that binds shared run events and applies them to `chatStore`
- `collectRunTools.ts`
  renderer-side tool selection before `invokeRunStart(...)`
- `reconcileRunErrorMessage.ts`
  assistant error-message cleanup after failed/completed runs
