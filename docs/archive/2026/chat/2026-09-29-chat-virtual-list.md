> Archived: 2026-09-29<br>
> Reason: TanStack Virtual was replaced by MessageScroller.<br>
> Original path: `docs/chat/chat-virtual-list.md`<br>
> Replaced by: [Current documentation](../../../architecture/chat-transcript-scrolling.md)
>
> Historical record. Implementation claims and verification results below describe the original phase; they are not current acceptance evidence.

# Chat Virtual List (TanStack Virtual)

## Goal
Reduce render cost for long chats by virtualizing the message list while keeping existing scroll-to-bottom behavior.

## What Changed
- Introduced TanStack Virtual (`@tanstack/react-virtual`).
- Replaced full `map` rendering with a virtualized list in `ChatWindow`.
- Added a dedicated scroll container ref instead of relying on `parentElement`.
- Kept the welcome card as a virtualized row when visible.

## Files
- `package.json`
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
