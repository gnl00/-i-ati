# Typewriter scheduling choices

Current playback uses `requestAnimationFrame` in
[useSegmentTypewriter](../../src/renderer/src/features/chat/message/typewriter/useSegmentTypewriter.ts).
Pacing and batching are separate from the browser's frame callback. See
[typewriter verification](../guides/testing/typewriter.md) for current parameters.

| Choice | Appropriate use | Constraints |
| --- | --- | --- |
| `requestAnimationFrame` | Schedule visible text updates near a paint opportunity | Callback frequency depends on frame rate and document state; the application still controls pacing and cleanup |
| `setInterval` / `setTimeout` | Time-based callbacks that do not need frame alignment | Delays are scheduling targets, not exact elapsed-time guarantees; busy or background contexts can delay callbacks |

Both approaches can capture stale React state if their callback lifetime and
state access are wrong. Choosing rAF alone does not fix closure ownership or
unmount cleanup. Keep animation state in the existing hook and cancel outstanding
callbacks when playback is replaced or the component unmounts.

For changes, compare displayed content fidelity, update cost and scroll/input
response with representative streaming fixtures. Avoid declaring one scheduler
universally faster or suitable for guaranteed background polling.
