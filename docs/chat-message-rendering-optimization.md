# Chat Message Rendering Optimization

## Goal
Reduce unnecessary re-renders by decoupling list rendering from full message objects.

## What Changed
- Chat list subscribes to `messageKeys` only, not the entire `messages` array.
- Each row fetches its own message from the store via `ChatMessageRow`.
- `useChatScroll` now depends on `messageCount` instead of full messages.

## Files
- `src/renderer/src/components/chat/ChatWindowComponentV2.tsx`
- `src/renderer/src/components/chat/useChatScroll.ts`
