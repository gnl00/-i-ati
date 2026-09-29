# Chat transcript scrolling

Last verified against source: 2026-09-29.

## Ownership

[ChatTranscriptScroller](../../src/renderer/src/features/chat/shell/ChatTranscriptScroller.tsx)
resolves scroll hints, stable row identity, overlay margins and search correction.
The shared [MessageScroller wrapper](../../src/renderer/src/shared/components/ui/message-scroller.tsx)
and provider own following, anchors, manual browsing, prepend preservation and
resize measurement. [ChatWindow](../../src/renderer/src/features/chat/shell/ChatWindow.tsx)
retains the plan overlay measurement, Welcome, side panel and input layout.
TanStack Virtual and the old scroll controller have exited production.

## Provider and items

The provider is keyed by `chatUuid` and uses `autoScroll`,
`defaultScrollPosition="end"`, `scrollEdgeThreshold=80`,
`scrollPreviousItemPeek=24` and the live top-overlay height as `scrollMargin`.
The content also uses this height as `padding-block-start` so the first row has
real layout space at scroll position zero.

Rows use stable string `messageId` values. Renderable user and assistant messages
become items; standalone tool records remain model context and do not create empty
transcript gaps. User items set `scrollAnchor=true`. Pending-to-committed assistant
rows retain their stable React identity.

History items use `content-visibility:auto` and intrinsic size. The current user,
current assistant, pending assistant and explicit search target use real layout
visibility. ResizeObserver recalculates sizes when content expands or wraps.

## Navigation and user intent

| Trigger | Target and behavior |
| --- | --- |
| Initial transcript mount | Latest position through provider end default |
| Conversation-switch hint | Resolved hint index and alignment |
| User-sent hint | Exact user row; the new user anchor establishes the reading start |
| Search-result hint | Exact message, start alignment, then one layout-frame correction |
| Latest button | Scroll to end and restore following; also complete current static assistant playback |

Hints are consumed once at the transcript boundary. Search first calls
`scrollToMessage()` and then uses `scrollIntoView()` with real target geometry;
scroll margins keep the result below the overlay. Wheel, touch and scroll-key
input pass to the provider. User history browsing releases following; the
`MessageScrollerButton` uses the provider's end state for visibility and recovery.

## Dependency patch and verification

The local `@shadcn/react@0.3.0` pnpm patch registers existing anchors on initial
content mount. This prevents an equal-size row replacement from being mistaken
for a new user anchor. The patch references shadcn/ui issue #11128; inspect it
again on dependency upgrades and remove it when the upstream fix is present.

[ChatWindow integration tests](../../src/renderer/src/features/chat/shell/__tests__/ChatWindow.message-scroller.test.tsx)
and the transcript tests protect provider parameters, row identity and hint
behavior. Previous automated results remain in the
[implementation archive](../archive/2026/chat/2026-09-29-message-scroller-integration.md).
They are historical results. Light/Dark, long-history, streaming and nested-scroll
checks remain in [Electron acceptance](../work/plans/chat/message-scroller-integration-implementation.md);
this documentation cleanup did not execute them.
