# Chat Scroll Hook

## Goal
Centralize chat scrolling logic and remove implicit scroll container access.

## What Changed
- Extracted scroll behavior into `useScrollManagerTop`.
- `ChatWindow` now only wires refs and consumes the hook outputs.
- Scroll container is explicit via `scrollContainerRef`.

## Files
- `src/renderer/src/features/chat/useScrollManagerTop.ts`
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
