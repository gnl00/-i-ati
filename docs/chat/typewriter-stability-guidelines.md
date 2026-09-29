# Typewriter Stability Guidelines

This document records tuning options for streaming text. Current production
parameters and renderer selection are documented in the
[typewriter verification guide](../guides/testing/typewriter.md). The values below
are experiment candidates, not measured production defaults.

## Goals
- Minimize visible jitter during streaming.
- Keep DOM updates predictable and small.
- Avoid heavy Markdown parsing while text is still changing.

## Recommended Tuning Order
1) **Force lightweight streaming renderer**
   - Current `StreamingMarkdownSwitch` uses `StreamingMarkdownLite` when typing
     with a defined `visibleText`; otherwise it uses full Markdown. Keep that
     distinction when evaluating a change.
   - Avoid `ReactMarkdown` during streaming to prevent expensive AST rebuilds.

2) **Shrink animation window (streaming only)**
   - Reduce `FluidTypewriterText.animationWindow` during streaming (e.g., 8–10).
   - Smaller window means fewer animated nodes → smoother frame rate.

3) **Lower update frequency (streaming only)**
   - Increase `batchUpdateInterval` in `useSegmentTypewriter` to 48–64ms.
   - Reduces the number of re-renders under rapid token streams.

4) **Cache expensive text transforms**
   - `fixMalformedCodeBlocks` should be memoized.
   - Prefer cached `visibleText` / `fixedText` in `StreamingMarkdownSwitch`.

5) **Keep DOM stable**
   - Avoid replacing the whole `segments` array on each tick; append only.
   - Stable keys + stable array references = fewer layout shifts.

## Key Implementation Sites
- `src/renderer/src/features/chat/message/assistant-message/index.tsx`
- `src/renderer/src/features/chat/message/typewriter/use-message-typewriter.ts`
- `src/renderer/src/features/chat/message/typewriter/FluidTypewriterText.tsx`
- `src/renderer/src/features/chat/message/typewriter/StreamingMarkdownLite.tsx`
- `src/renderer/src/features/chat/message/typewriter/StreamingMarkdownSwitch.tsx`

## Candidate tuning values
- Streaming:
  - `batchUpdateInterval`: 48–64
  - `animationWindow`: 8–10
- Non-streaming:
  - `batchUpdateInterval`: 16–32
  - `animationWindow`: 12–15

## Notes
- If you must keep full Markdown during streaming, expect more jitter.
- Blur effects on many tokens increase GPU cost; keep the animated window small.
- Stability is more noticeable than speed. A slower cadence can feel smoother.
