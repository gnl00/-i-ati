# Chat Scroll Hook

## Goal
Centralize chat scrolling logic and remove implicit scroll container access.

## What Changed
- Extracted scroll behavior into `useChatScroll`.
- `ChatWindowComponentV2` now only wires refs and consumes the hook outputs.
- Scroll container is explicit via `scrollContainerRef`.

## Files
- `src/renderer/src/components/chat/useChatScroll.ts`
- `src/renderer/src/components/chat/ChatWindowComponentV2.tsx`
