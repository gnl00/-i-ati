# Chat Message Rendering Optimization

## Goal
Reduce unnecessary re-renders by decoupling list rendering from full message objects.

## What Changed
- Chat list subscribes to `messageKeys` only, not the entire `messages` array.
- Each row fetches its own message from the store via `ChatMessageRow`.
- `useScrollManagerTop` consumes stable message and viewport facts instead of the full message array.

## Files
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
- `src/renderer/src/features/chat/useScrollManagerTop.ts`
