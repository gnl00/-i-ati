# Typewriter Stability Guidelines

This document summarizes practical steps to make the typewriter animation feel more stable, smooth, and consistent during streaming.

## Goals
- Minimize visible jitter during streaming.
- Keep DOM updates predictable and small.
- Avoid heavy Markdown parsing while text is still changing.

## Recommended Tuning Order
1) **Force lightweight streaming renderer**
   - When `isTyping === true`, always render via `StreamingMarkdownLite`.
   - Avoid `ReactMarkdown` during streaming to prevent expensive AST rebuilds.

2) **Shrink animation window (streaming only)**
   - Reduce `FluidTypewriterText.animationWindow` during streaming (e.g., 8–10).
   - Smaller window means fewer animated nodes → smoother frame rate.

3) **Lower update frequency (streaming only)**
   - Increase `batchUpdateInterval` in `useSegmentTypewriterNext` to 48–64ms.
   - Reduces the number of re-renders under rapid token streams.

4) **Cache expensive text transforms**
   - `fixMalformedCodeBlocks` should be memoized.
   - Prefer cached `visibleText` / `fixedText` in `StreamingMarkdownSwitch`.

5) **Keep DOM stable**
   - Avoid replacing the whole `segments` array on each tick; append only.
   - Stable keys + stable array references = fewer layout shifts.

## Key Implementation Sites
- `src/renderer/src/components/chat/chatMessage/assistant-message.tsx`
- `src/renderer/src/components/chat/chatMessage/use-message-typewriter.ts`
- `src/renderer/src/components/chat/chatMessage/FluidTypewriterText.tsx`
- `src/renderer/src/components/chat/chatMessage/StreamingMarkdownLite.tsx`
- `src/renderer/src/components/chat/chatMessage/StreamingMarkdownSwitch.tsx`

## Practical Baseline Values
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
