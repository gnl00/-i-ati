# Tool Result Normalization

Tool results pass through a shared normalization layer before they enter chat state, transcript replay, and persisted history. The layer keeps model-facing content bounded while preserving original payloads as local artifacts.

## Problem

Some tools return payloads that are useful for inspection and expensive for context replay:

- Inline image data, including `data:image/...;base64,...` and raw base64 image strings.
- Large JSON or text payloads.
- Nested structures where one field contains a large binary-like value.

When these payloads are written directly to tool messages, every subsequent request can replay the full content. Computer-use tools amplify the issue because window snapshots often include screenshots and accessibility trees together.

## Runtime Boundaries

The normalization layer sits on three boundaries:

- Tool execution event: `DefaultToolExecutorDispatcher` normalizes completed results before host render events receive them.
- Transcript write-back: `DefaultToolResultRecordMaterializer` applies the same normalizer as an idempotent guard.
- Request replay: `RequestMaterializer` and `UnifiedRequestMessageMaterializer` apply a final model-request guard for legacy history and custom runtime injectors.

This keeps the policy tool-agnostic. Tool processors can return rich outputs, and the runtime decides how much content is allowed to flow into the model window.

## Artifact Layout

Artifacts are stored under the app data directory by default:

```text
<userData>/tool-result-artifacts/<scope>/<stepId>/<toolCallId>/
  raw-result.json.gz
  image-1.png
  image-2.jpg
  metadata.json
```

`scope` is usually the chat UUID when the host can provide it. Runtime tests and generic subagents can use a fallback scope.

## Normalized Content Shape

Large or image-bearing results are replaced with a compact object:

```ts
{
  __atiToolResultNormalized: true,
  version: 1,
  toolName: string,
  toolCallId: string,
  status: string,
  summary: string,
  original: {
    characters: number,
    triggers: Array<'inline_image' | 'large_content'>
  },
  artifacts: [
    {
      kind: 'raw_result' | 'image',
      path: string,
      bytes: number,
      sha256: string,
      mimeType?: string,
      sourcePath?: string
    }
  ],
  modelContent: string
}
```

Small text and small JSON continue to pass through unchanged.

## Image Policy

Current phase:

- Extract inline image bytes into local artifacts.
- Keep model-facing content as summary plus artifact references.
- Keep `metadata.json` ready for visual summaries.

Planned VLM phase:

- Current running tool result can provide raw image content to a model adapter that supports multimodal tool responses.
- Historical image-bearing tool results are represented by VLM summaries plus artifact paths.
- The VLM summary cache is keyed by image hash, tool name, and normalization version.

## Request Guard

The request guard is a last line of defense. It compacts tool message content when either condition is true:

- The string exceeds the configured character budget.
- The string contains inline image data.

The guard returns a short note with original length and compaction reason. New normalized records should already be compact, so this primarily protects older DB messages and custom materializers.

## Phased Plan

1. Phase 1: Add artifact store, classifier, normalizer, transcript/event integration, request guard, and targeted tests.
2. Phase 2: Add VLM caption service, hash cache, and cold-history materialization.
3. Phase 3: Add artifact lifecycle management, retention policy, and UI artifact affordances.
4. Phase 4: Add adapter-level multimodal tool result support for hot images.

## Current Implementation

Phase 1 is implemented in:

- `src/main/agent/runtime/tools/result-normalization/`
- `src/main/agent/runtime/tools/ToolExecutorDispatcher.ts`
- `src/main/agent/runtime/transcript/ToolResultRecordMaterializer.ts`
- `src/main/agent/runtime/transcript/RequestMaterializer.ts`
- `src/shared/tools/toolResultContent.ts`
- `src/shared/services/RequestMessageBuilder.ts`

The current request content uses `modelContent`, a compact text representation with artifact references. VLM summaries and multimodal hot-image adapter support are tracked as Phase 2 and Phase 4 work.

## Acceptance

- Inline image tool results are persisted as artifacts and model-facing content contains no base64 image data.
- Large tool results are replaced by compact metadata and a raw-result artifact.
- Legacy tool messages with inline images are compacted during request replay.
- The design works for all tool names, including computer-use tools.
