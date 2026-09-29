> Archived: 2026-09-29<br>
> Reason: The sentinel-based button implementation is historical.<br>
> Original path: `docs/chat/chat-scroll-bottom-button-fix.md`<br>
> Replaced by: [Current documentation](../../../architecture/chat-transcript-scrolling.md)
>
> Historical record. Implementation claims and verification results below describe the original phase; they are not current acceptance evidence.

# Chat scroll bottom button fix

## Problem
When a user sends a new message with multiple messages already in the list, the scroll-to-bottom button briefly appeared and then disappeared. This was caused by content height changes making the scroll listener think the user scrolled up.

## Root cause
The previous logic inferred "at bottom" from `scrollHeight - scrollTop - clientHeight`. When new content arrived, the distance from bottom jumped before auto-scroll ran, so the button toggled on briefly.

## Fix
- Added a bottom sentinel and `IntersectionObserver` to determine whether the user is at the bottom, removing jitter from height changes.
- Kept the old scroll-height check only as a fallback when `IntersectionObserver` is unavailable.
- Centralized bottom-state handling to keep button visibility consistent.

## User impact
The scroll-to-bottom button no longer flashes during message append or assistant initialization. Button visibility now tracks actual scroll position instead of layout shifts.

## Notes
The observer uses a small bottom margin to consider "near bottom" as bottom for a smoother UX.
