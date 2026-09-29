> Archived: 2026-09-29<br>
> Reason: The historical scroll hook is superseded.<br>
> Original path: `docs/chat/chat-scroll-hook.md`<br>
> Replaced by: [Current documentation](../../../architecture/chat-transcript-scrolling.md)
>
> Historical record. Implementation claims and verification results below describe the original phase; they are not current acceptance evidence.

# Chat Scroll Hook (superseded)

## Goal
This historical hook document is superseded by the shared MessageScroller provider.

## What Changed
- The current implementation is owned by `ChatTranscriptScroller` and the shared `MessageScroller` primitives.
- Conversation hints, anchor metadata, and latest-message navigation are kept at the transcript boundary.

## Files
- `src/renderer/src/features/chat/shell/ChatTranscriptScroller.tsx`
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
