# Typewriter verification

Last verified against source: 2026-09-29.

Production uses the local segment playback and Markdown components. FlowToken
is retained as a [research reference](../../reference/flowtoken.md).

Current [playback parameters](../../../src/renderer/src/features/chat/message/typewriter/use-message-typewriter-playback.ts)
are token granularity, `minSpeed: 15`, `maxSpeed: 30`, and batching at 32ms while
streaming or 16ms otherwise. Streaming typing callbacks use a 50ms debounce.
[StreamingMarkdownSwitch](../../../src/renderer/src/features/chat/message/typewriter/StreamingMarkdownSwitch.tsx)
uses the lightweight renderer when typing with a defined `visibleText`; completed
text or undefined `visibleText` uses full Markdown.

## Automated checks after implementation changes

```bash
pnpm exec vitest run \
  src/renderer/src/features/chat/message/typewriter/__tests__/useSegmentTypewriter.test.tsx \
  src/renderer/src/features/chat/message/typewriter/__tests__/FluidTypewriterText.test.ts \
  src/renderer/src/features/chat/message/typewriter/__tests__/useReasoningTypewriter.test.tsx \
  src/renderer/src/features/chat/message/typewriter/__tests__/assistantStreamingPerf.test.tsx
pnpm run typecheck:web
```

## Electron checks

Start with `pnpm dev`; test Light/Dark at compact and wide sizes.

- Stream short English, Chinese and mixed-language responses; inspect punctuation and token pacing.
- Stream long Markdown, code, lists, tables and math; verify lightweight-to-full rendering and final content fidelity.
- Expand reasoning and tools while streaming; check input and scrolling responsiveness.
- Cancel, switch chats and reopen persisted completed messages; verify final text and playback completion state.
- Check reduced motion and keyboard navigation; capture screenshots or recordings for changed visual behavior.

Use the existing [streaming performance guide](../development/chat-streaming-performance-p1-p2-optimization.md)
for instrumented measurements. Record conditions before comparing timings.
The 2026-09-29 cleanup checked source parameters; it did not rerun playback tests
or perform Electron acceptance.
