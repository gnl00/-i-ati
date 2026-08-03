# Chat Scroll Hook

## Goal
Centralize chat scrolling logic and remove implicit scroll container access.

## What Changed
- Extracted scroll behavior into `useScrollManagerTop`.
- `ChatWindow` now only wires refs and consumes the hook outputs.
- Scroll container is explicit via `scrollContainerRef`.
- `scrollToMessageIndex()` 与 `scrollToMessageOffset()` 都在当前帧写入 virtualizer；调用方用 RAF 协调布局提交，跳回最新事务由 `ChatWindow` 维护。

## Files
- `src/renderer/src/features/chat/useScrollManagerTop.ts`
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
