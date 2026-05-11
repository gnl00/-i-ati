# Tool Call Reason

## Purpose

`tool_call_reason` is a required model supplied tool argument that explains why the model is invoking a tool at that moment. The value is used only for transcript presentation and diagnostics. Tool processors receive the original tool arguments after this field is removed.

The field should stay short, use the same language the user is currently using, and describe the intended observable outcome in one sentence.

## Schema

The shared helper in `src/shared/tools/definitions-utils.ts` injects the field into tool schemas:

- `TOOL_CALL_REASON_PARAMETER_NAME` defines the canonical argument name.
- `withToolCallReasonParameters` adds the string schema and includes it in `required`.
- `withToolCallReasonDefinition` applies the same behavior to embedded `ToolDefinition` entries.
- `withToolCallReasonFlatTool` applies the same behavior to flat tool shapes used by runtime request builders.
- `mergeToolDefinitions` applies the injection while merging embedded tool groups.

Adapters also normalize request tool schemas before sending them upstream:

- `src/main/request/adapters/base.ts` applies the field to OpenAI compatible tools.
- `src/main/request/adapters/claude.ts` maps the normalized schema to Claude `input_schema`.

## Execution

`src/main/agent/tools/ToolExecutor.ts` strips `tool_call_reason` before dispatching to embedded handlers or MCP runtime tools. This keeps the reason available in the assistant message model while preserving existing processor argument contracts.

## Rendering

The renderer reads the reason from visible tool-call segments:

- `src/renderer/src/components/chat/chatMessage/assistant-message/model/toolCallReason.ts` parses object and JSON-string tool args, builds ordered reason items, and returns the first active non-terminal reason.
- `assistantMessageMapper.ts` computes both `header.toolCallReason` for the active reason and `header.toolCallReasons` for the full ordered reason history.
- Terminal tool calls remain in the reason history, while the active highlight follows the first non-terminal reason.
- `emotion_report` remains hidden from the transcript through existing segment presentation metadata, so its reason is also hidden from the badge.

The assistant header separates model identity from reason history:

- `AssistantMessageContainer.tsx` passes the value into the header model.
- `AssistantMessageHeader.tsx` passes it into `ModelBadgeNext`.
- `ModelBadgeNext.tsx` renders model identity and emotion in the badge, then renders `ToolCallReasonTrace`.
- `ToolCallReasonTrace.tsx` displays reasons from old to new in a horizontal scroll lane, scrolls to the newest reason, and highlights the active processing reason from `header.toolCallReason`.

When multiple tool calls happen in sequence, the trace preserves prior reasons:

```text
model badge
reason 1 - reason 2 - reason 3
```

The newest reason stays focused at the right edge. The active highlight uses the same contract as `buildActiveToolCallReason()`: the earliest non-terminal reason is active. Once that reason reaches a terminal state, its amber highlight transitions back to the neutral style.

Animation details:

- Each reason enters from the right, including the first item and later appended items.
- Color, border, background, and shadow changes use a short transition so active-to-neutral changes feel continuous.
- The horizontal overflow mask uses a valid `calc(100% - 18px)` value encoded for Tailwind arbitrary value syntax as `calc(100%_-_18px)`.

## Development Preview

- `src/renderer/src/pages/test/ToolCallReasonHistoryTestPage.tsx` is the focused playground for fast reason switching, wide and narrow badge lanes, and active-to-neutral visual transitions.
- `src/renderer/src/pages/test/ToolCallReasonTraceTestPage.tsx` contains assistant-message mock scenarios, including wide/narrow layouts, sequential reason switching, and real `AssistantMessage` container wiring.

Both pages are kept as reusable test fixtures under `src/renderer/src/pages/test`.

## Tests

Key coverage:

- Shared schema injection: `src/shared/tools/__tests__/definitions.test.ts`
- Embedded and external registry behavior: `src/shared/tools/__tests__/registry.test.ts`
- OpenAI and Claude adapter schemas: `src/main/request/adapters/__tests__/*adapter.test.ts`
- Tool execution argument cleanup: `src/main/agent/tools/__tests__/ToolExecutor.test.ts`
- Renderer extraction and active reason selection: `toolCallReason.test.ts`
- Assistant render model and container propagation: `assistantMessageRenderModel.test.ts`, `AssistantMessage.render.test.tsx`
- Reason trace active highlight and overflow mask: `ToolCallReasonTrace.test.tsx`
- Tool result output filtering: `ToolCallResultNextOutput.test.tsx`
