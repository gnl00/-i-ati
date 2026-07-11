# Assistant Streaming Preview Patch Stability

## Context

Assistant streaming text uses two update paths during a run.

1. `PREVIEW_UPDATED` installs or replaces the current preview assistant message.
2. `PREVIEW_SEGMENT_UPDATED` updates the active preview text or reasoning segment through `PreviewPatchBatcher`.

The assistant message renderer maps preview text segments into `AssistantTextSegmentList`, then `useMessageTypewriter` reads the current segment content and reveals visible tokens through `StreamingMarkdownSwitch`.

## Failure Mode

The observed UI symptom was a text segment that rendered the first character, then held the remaining streamed text until run completion.

The event flow was:

1. The first preview body rendered through `PREVIEW_UPDATED`.
2. Later text deltas arrived through `PREVIEW_SEGMENT_UPDATED`.
3. `PreviewPatchBatcher.enqueue()` queued each patch.
4. The default scheduler used a detached `requestAnimationFrame` reference.
5. Electron raised `TypeError: Illegal invocation` while scheduling the RAF flush.
6. The queued patches stayed pending until the run completion path called `flush('sync')`.

The typewriter waited for updated segment content. The stalled point was the preview patch scheduling layer.

## Current Fix

`PreviewPatchBatcher` now creates default frame scheduler functions as bound closures around the active frame target. This preserves the native browser/Electron invocation context for `requestAnimationFrame` and `cancelAnimationFrame`.

`enqueue()` now catches scheduler failures, records structured diagnostics, and immediately flushes pending preview patches with the `schedule_error` reason. This keeps streamed text moving through the store even when frame scheduling fails.

`bindChatRunEvents()` now routes run events through `handleChatRunEventSafely()`. Handler failures are logged with event metadata and segment context, which keeps IPC event delivery stable and makes the next diagnosis concrete.

## Diagnostics

The batcher scheduler failure log uses:

- `assistant_streaming.preview_patch_batch.schedule_failed`
- `pendingPatchCount`
- `segmentId`
- `segmentType`
- `textLength`
- normalized error name, message, and stack

The run event handler failure log uses:

- `chat_run.event_handler_failed`
- event type, submission id, sequence, chat id, and chat uuid
- segment id, segment type, and text length when a segment patch is present
- normalized error name, message, and stack

## Verification

Validated commands:

```bash
pnpm run typecheck:web
pnpm test:run src/renderer/src/features/chat/runtime/__tests__/previewPatchBatcher.test.ts src/renderer/src/features/chat/runtime/__tests__/chatRunEvent.test.ts
```

Covered cases:

- default RAF scheduler preserves the frame target invocation context
- scheduler failure synchronously flushes queued preview patches
- scheduler failure emits structured batcher diagnostics
- run event handler failure resolves safely and emits structured event diagnostics
