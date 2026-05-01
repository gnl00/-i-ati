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
- Terminal tool calls are hidden from the model badge reason slot after completion, failure, abort, denial, timeout, cancellation, or result/error availability.
- `emotion_report` remains hidden from the transcript through existing segment presentation metadata, so its reason is also hidden from the badge.

The active reason is displayed in the assistant model badge:

- `assistantMessageMapper.ts` computes `header.toolCallReason`.
- `AssistantMessageContainer.tsx` passes the value into the header model.
- `AssistantMessageHeader.tsx` passes it into `ModelBadgeNext`.
- `ModelBadgeNext.tsx` renders the reason after model info and before emotion, with layout and reason switch animations.

When multiple tool calls happen in sequence, the badge shows the active reason in tool-call order:

```text
model info -> reason 1 -> emotion
model info -> reason 2 -> emotion
model info -> reason 3 -> emotion
```

After the last tool call completes, the reason leaves the badge.

## Development Preview

`src/renderer/src/pages/test/ToolCallReasonTraceTestPage.tsx` contains mock scenarios for visual tuning, including wide/narrow layouts, sequential reason switching, and real `AssistantMessage` container wiring. The page is kept as a reusable test fixture. It is intentionally detached from `src/renderer/src/App.tsx` during normal app startup.

## Tests

Key coverage:

- Shared schema injection: `src/shared/tools/__tests__/definitions.test.ts`
- Embedded and external registry behavior: `src/shared/tools/__tests__/registry.test.ts`
- OpenAI and Claude adapter schemas: `src/main/request/adapters/__tests__/*adapter.test.ts`
- Tool execution argument cleanup: `src/main/agent/tools/__tests__/ToolExecutor.test.ts`
- Renderer extraction and active reason selection: `toolCallReason.test.ts`
- Assistant render model and container propagation: `assistantMessageRenderModel.test.ts`, `AssistantMessage.render.test.tsx`
- Tool result output filtering: `ToolCallResultNextOutput.test.tsx`
