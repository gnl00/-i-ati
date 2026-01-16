# Typewriter Update Optimization

## Goal
Avoid full message list updates when marking `typewriterCompleted`.

## What Changed
- `useMessageTypewriter` now uses `upsertMessage` on the single message instead of `setMessages` on the full array.
- Reads the current message via `useChatStore.getState()` to avoid subscribing to the entire list.
- Persists the updated message to SQLite as before.

## Files
- `src/renderer/src/components/chat/chatMessage/use-message-typewriter.ts`
