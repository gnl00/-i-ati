# Thinking Reasoning Replay

## Background

`mimo-v2.5-pro` and similar OpenAI-compatible thinking models return hidden
reasoning through `reasoning_content`. When a response also contains tool calls,
the next `/chat/completions` request must replay the previous assistant
reasoning through the same provider field.

The observed failure shape:

```text
user request
-> model response: reasoning_content + tool_calls
-> tool result
-> next model request
-> HTTP 400 Param Incorrect:
   The reasoning_content in the thinking mode must be passed back to the API.
```

This affects every host that can run a reasoning-capable model through the
shared chat runtime:

- renderer chat
- Telegram
- scheduled runs
- future main-process hosts

## Root Cause

The stream parser already receives provider reasoning and stores it in runtime
state:

```text
OpenAI stream delta.reasoning_content
-> IUnifiedStreamResponse.delta.reasoning
-> ModelResponseParser reasoning_delta
-> AgentStepDraft.snapshot.reasoning
-> AgentStep.reasoning
```

The missing part is replay. Once a completed assistant step is written back to
the runtime transcript, the following request materialization path must preserve
that reasoning:

```text
assistant_step.step.reasoning
-> MaterializedAssistantProtocolMessage.reasoning
-> UnifiedRequestMessage.reasoning
-> OpenAI message.reasoning_content
```

The provider adapter should only translate field names. The stable replay
contract belongs to the runtime transcript and request materialization layers.
`ChatMessage` remains the UI and persistence message shape, while
`UnifiedRequestMessage` is the provider-adapter input shape. The request
contract is closed to persistence-only fields and uses explicit protocol fields:
assistant messages carry `reasoning` and `toolCalls`, while tool result messages
carry `toolCallId` and `toolName`.

## Target Contract

### Host request options

`RunRequestFactory.resolveRequestOptions()` is the main-side guard for all host
runs.

Rules:

- A reasoning-capable model plus a thinking-capable adapter receives an
  effective thinking level.
- Renderer selections such as `high`, `medium`, and `none` are preserved when
  supported.
- Main-process hosts that omit options receive the adapter default level.
- Models without reasoning capability produce request options without
  `thinkingLevel`.

### Reasoning replay

`AgentStep.reasoning` is treated as provider replay metadata.

Rules:

- `AgentStep.reasoning` survives transcript materialization.
- The executable request keeps assistant reasoning beside assistant content and
  tool calls.
- `IUnifiedRequest.messages` uses `UnifiedRequestMessage[]`, so request adapters
  receive provider-neutral protocol messages without persistence-only fields
  such as `segments`, `source`, `model`, or `modelRef`.
- Tool result request messages carry `toolName` as the provider-neutral
  function name for native provider payloads that require it.
- OpenAI-compatible adapters map assistant `reasoning` to
  `reasoning_content` for thinking requests.
- Non-thinking requests keep the provider payload free of
  `reasoning_content`.

### Request message stages

Host `buildContextMessages` returns ChatMessage[] with assistant reasoning intact.
`mapChatContext` creates ContextRecord[] once. ContextManager selects a budgeted view;
`projectContextRequest` preserves `record.step.reasoning` beside content and calls.
ExecutableRequestAdapter then emits provider-neutral UnifiedRequestMessage[].
Reasoning is included in token budgeting and complete groups are omitted together.

## Test Matrix

Required coverage:

- `ChatPreparationPipeline`
  - reasoning model with omitted options receives default thinking level
  - explicit `thinkingLevel: "none"` is preserved
  - non-reasoning model strips thinking options
- `projectContextRequest`
  - assistant step reasoning is preserved in protocol messages
- `DefaultExecutableRequestAdapter`
  - assistant protocol reasoning enters unified request messages
  - executable request messages do not contain `segments`
- `DefaultAgentRuntime`
  - first step returns reasoning plus tool calls
  - tool result is appended
  - second model request includes assistant reasoning and tool calls
- `OpenAIAdapter`
  - thinking request emits `reasoning_content`
  - regular request omits `reasoning_content`

## Operational Notes

The fix requires rebuilding the main process bundle before validating a local
app run. Running from an older `out/main/index.js` can reproduce the same 400
even when source files are already fixed.
