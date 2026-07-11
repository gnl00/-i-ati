# Tool Call Reason

## Purpose

`tool_call_reason` is a required model supplied tool argument that explains why the model is invoking a tool at that moment. The value is used for transcript presentation and diagnostics. Tool processors receive the executable tool arguments after this field is removed.

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

The renderer reads tool-call reasons at the tool row level:

- `src/renderer/src/features/chat/message/assistant-message/model/toolCallReason.ts` exposes `getReasonFromToolCall(segment)`.
- `getReasonFromToolCall` reads `tool_call_reason` from object args and JSON string args, trims the value, and returns a visible reason for non-empty strings.
- `ToolCallTriggerContent` calls `getReasonFromToolCall` and renders the reason below the tool name inside the tool row.
- `ToolCallResultPanel` filters `tool_call_reason` from summary and detail parameter output through `filterDisplayParamEntries`.
- Summary parameter components receive filtered entries, so the synthetic reason field stays out of normal tool parameters.
- `SupportSegmentGroup` uses the same `ToolCallTriggerContent` and `ToolCallResultPanel` row renderer for grouped tool rows.

Streaming updates can add `tool_call_reason` while a tool call remains `pending`. `areToolCallSegmentsEqual` compares the extracted reason from the previous and next segments, so memoized tool rows re-render when a streamed args patch adds or changes the reason.

## Development Preview

- `src/renderer/src/dev/test-pages/ToolCallReasonHistoryTestPage.tsx` is a row-level reason scenarios fixture for fast reason switching and history-style mock states.
- The assistant-message test pages under `src/renderer/src/dev/test-pages` include mocked tool-call rows with `tool_call_reason` for layout and wrapping checks.

Both pages are kept as reusable test fixtures under `src/renderer/src/dev/test-pages`.

## Tests

Key coverage:

- Shared schema injection: `src/shared/tools/__tests__/definitions.test.ts`
- Embedded and external registry behavior: `src/shared/tools/__tests__/registry.test.ts`
- OpenAI and Claude adapter schemas: `src/main/request/adapters/__tests__/*adapter.test.ts`
- Tool execution argument cleanup: `src/main/agent/tools/__tests__/ToolExecutor.test.ts`
- Renderer extraction: `src/renderer/src/features/chat/message/assistant-message/__tests__/toolCallReason.test.ts`
- Row-level tool result rendering and filtering: `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallResult.test.tsx`
- Grouped support row rendering: `src/renderer/src/features/chat/message/assistant-message/__tests__/SupportSegmentGroup.test.tsx`
