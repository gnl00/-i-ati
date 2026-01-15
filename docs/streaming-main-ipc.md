# Streaming In Main With IPC Batching

## Summary
Moving the request/stream handling to the Electron main process can help
only if the main process buffers tokens and sends them to the renderer in
batched intervals (e.g., every 32-50ms). This reduces renderer update
frequency and can improve perceived smoothness. Simply relocating the
network request without batching will not fix renderer jank.

## Why It Can Help
- Renderer receives fewer updates, so React and layout work less often.
- IPC messages carry larger chunks, reducing overhead per token.
- Main can coalesce rapid token bursts and flush on a stable cadence.

## When It Will Not Help
- If renderer still renders per-token or per-character internally.
- If markdown + animation work remains heavy per update.
- If the renderer is already bottlenecked by layout or paint.

## Proposed Flow
1) Main process opens the streaming request.
2) Incoming tokens are appended to a buffer.
3) A flush timer (32-50ms) sends buffered text to renderer via IPC.
4) Renderer appends the batch to the latest message and renders once.
5) On stream end: flush any remaining buffer immediately.

## Implementation Sketch (Pseudo)
Main process:
```ts
let buffer = ''
let flushTimer: NodeJS.Timeout | null = null

function onToken(chunk: string) {
  buffer += chunk
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      ipcSend('stream:chunk', buffer)
      buffer = ''
      flushTimer = null
    }, 32) // or 50ms
  }
}

function onEnd() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (buffer) {
    ipcSend('stream:chunk', buffer)
    buffer = ''
  }
  ipcSend('stream:end')
}
```

Renderer:
```ts
ipcOn('stream:chunk', (chunk) => {
  appendToLatestAssistantMessage(chunk) // single state update
})
```

## Tuning Guidelines
- Flush interval: 32ms for smoother motion, 50ms for lower CPU.
- Flush on end: always flush remaining buffer immediately.
- Backpressure: if renderer is busy, drop to a longer interval (optional).

## Risks / Caveats
- IPC batching reduces update frequency but does not eliminate heavy
  rendering (markdown, animations, layout).
- If the latest message is very large, even batched updates can still
  be expensive.
- Beware of ordering: ensure token order is preserved per request.

## Recommendation
This approach is viable and often effective when the renderer is the
bottleneck due to frequent updates. It is most effective when combined
with renderer-side throttling and reduced animation during streaming.
