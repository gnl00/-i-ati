# MessageScroller Electron acceptance

Owner: Chat renderer maintainers<br>
Status: Active<br>
Started: 2026-09-02<br>
Updated: 2026-09-29<br>
Target: Complete real Electron acceptance for the implemented MessageScroller integration<br>
Exit criteria: Record Light/Dark and long-history runtime results below, resolve failures, then archive this work<br>
Related specs: [Documentation governance](../../../specs/documentation-governance.md)<br>
Related implementation: [ChatTranscriptScroller](../../../../src/renderer/src/features/chat/shell/ChatTranscriptScroller.tsx), [MessageScroller wrapper](../../../../src/renderer/src/shared/components/ui/message-scroller.tsx)

Production uses MessageScroller and React 19.2.3. Current behavior and ownership
are documented in [Chat transcript scrolling](../../../architecture/chat-transcript-scrolling.md).
The [implementation record](../../../archive/2026/chat/2026-09-29-message-scroller-integration.md)
retains the original plan, automated results and dependency patch rationale.
Those results are historical; this work remains Active because Electron manual
acceptance was recorded as pending.

## Remaining runtime checks

Run in Light/Dark Mode, at compact and wide window sizes:

- [ ] Open a long conversation from Welcome; first visible position is the latest content.
- [ ] Send short and long requests with the plan/header overlay present; verify user anchor and previous-item peek.
- [ ] Observe streaming Markdown, code and tools; browse history during streaming and resume following with the latest button.
- [ ] Check wheel, touchpad, scrollbar, PageUp/PageDown and Home/End, including nested code/tool output scrolling.
- [ ] Search first, middle and last messages; confirm target visibility below the overlay.
- [ ] Switch equal-length conversations; confirm provider state isolation and stable pending-to-committed rows.
- [ ] Expand reasoning, tools and completed work; resize the window and side panel without losing reading position.
- [ ] Exercise 1,000 mixed rows, checking input response, scroll stability and history content visibility.

Capture screenshots or recordings and the exact build used. Source review on
2026-09-29 did not execute these runtime checks. A failed performance check
requires a recorded remediation decision; do not close this task based solely
on the previous automated pass.
