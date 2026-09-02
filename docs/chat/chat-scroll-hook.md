# Chat Scroll Hook (superseded)

## Goal
This historical hook document is superseded by the shared MessageScroller provider.

## What Changed
- The current implementation is owned by `ChatTranscriptScroller` and the shared `MessageScroller` primitives.
- Conversation hints, anchor metadata, and latest-message navigation are kept at the transcript boundary.

## Files
- `src/renderer/src/features/chat/shell/ChatTranscriptScroller.tsx`
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
