# Tool Result Normalization

Tool results use a hot/cold replay policy. Results created during the active run stay readable for immediate model continuation. Results that leave the active run are normalized into compact model content plus local artifacts.

## Problem

Some tools return payloads that are useful for inspection and expensive for context replay:

- Inline image data, including `data:image/...;base64,...` and raw base64 image strings.
- Large JSON or text payloads.
- Nested structures where one field contains a large binary-like value.

When these payloads are written directly to tool messages, every subsequent request can replay the full content. Computer-use tools amplify the issue because window snapshots often include screenshots and accessibility trees together.

## Runtime Boundaries

The normalization layer sits on four boundaries:

- Tool execution event: `DefaultToolExecutorDispatcher` returns raw tool results so the active run can continue with the full payload.
- Transcript write-back: `DefaultToolResultRecordMaterializer` writes active-run results as `replayMode: "hot"`.
- Active request replay: `RequestMaterializer` sends `hot` tool results to the next model step without the size/image guard.
- Terminal snapshot and history replay: `DefaultAgentTranscriptSnapshotMaterializer` and `RequestMaterializer` apply normalization or final request guards for cold history and legacy messages.

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

Small text and small JSON continue to pass through unchanged. Hot results also pass through unchanged during the active run.

## Image Policy

Current phase:

- Extract inline image bytes into local artifacts.
- Keep active-run tool results available to the next model step with original content.
- Keep cold model-facing content as summary plus artifact references.
- Keep `metadata.json` ready for visual summaries.

Planned VLM phase:

- Historical image-bearing tool results are represented by VLM summaries plus artifact paths.
- The VLM summary cache is keyed by image hash, tool name, and normalization version.

## Request Guard

The request guard is a last line of defense for cold and legacy tool messages. It compacts tool message content when either condition is true:

- The string exceeds the configured character budget.
- The string contains inline image data.

The guard returns a short note with original length and compaction reason. New normalized records should already be compact, so this primarily protects older DB messages and custom materializers. `replayMode: "hot"` records bypass this guard for the active run.

## Phased Plan

1. Phase 1: Add artifact store, classifier, hot/cold replay policy, terminal snapshot normalization, request guard, and targeted tests.
2. Phase 2: Add VLM caption service and hash cache for cold image history.
3. Phase 3: Add artifact lifecycle management, retention policy, and UI artifact affordances.
4. Phase 4: Add adapter-level multimodal tool result support for hot images.

## Current Implementation

Phase 1 is implemented in:

- `src/main/agent/runtime/tools/result-normalization/`
- `src/main/agent/runtime/transcript/AgentTranscriptSnapshotMaterializer.ts`
- `src/main/agent/runtime/transcript/ToolResultRecordMaterializer.ts`
- `src/main/agent/runtime/transcript/RequestMaterializer.ts`
- `src/shared/tools/toolResultContent.ts`
- `src/shared/services/RequestMessageBuilder.ts`

Active-run replay uses raw tool result content. Terminal snapshots and cold history use `modelContent`, a compact text representation with artifact references. VLM summaries and multimodal hot-image adapter support are tracked as Phase 2 and Phase 4 work.

## Acceptance

- Active-run tool results remain available to the next model step with original content.
- Terminal snapshots persist inline image tool results as artifacts and cold model-facing content contains compact references.
- Terminal snapshots replace large cold tool results with compact metadata and a raw-result artifact.
- Legacy tool messages with inline images are compacted during request replay.
- The design works for all tool names, including computer-use tools.
