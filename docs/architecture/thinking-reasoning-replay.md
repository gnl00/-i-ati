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

`RequestMessageBuilder` now has an explicit two-stage output path:

1. `RequestMessageBuilder.build()` returns `RequestMessageBuildResult`.
   This stage stays in chat-domain shape with `systemPrompt` and
   `chatMessages: ChatMessage[]`. It applies compression, historical image
   trimming, ephemeral context insertion, user instruction insertion, and tool
   pair repair.
2. `UnifiedRequestMessageMaterializer.materialize()` returns
   `UnifiedRequestMessageBuildResult`. This stage converts `ChatMessage[]` to
   `UnifiedRequestMessage[]`, strips UI and persistence fields, and derives
   `toolName` for tool result replay from the persisted tool message name or
   the paired assistant tool call.

`RunRequestFactory` composes both stages before creating `IUnifiedRequest`.

## Implementation Plan

1. Keep main-side thinking-level normalization in `RunRequestFactory`.
2. Add `reasoning?: string` to `MaterializedAssistantProtocolMessage`.
3. Copy `record.step.reasoning` in `DefaultRequestMaterializer`.
4. Add `UnifiedRequestMessage` as the request adapter message contract.
5. Change `IUnifiedRequest.messages` from `ChatMessage[]` to
   `UnifiedRequestMessage[]`.
6. Split `RequestMessageBuilder` output into chat-domain build and
   `UnifiedRequestMessage` materialization stages.
7. Copy assistant reasoning in `DefaultExecutableRequestAdapter`.
8. Map assistant reasoning to `reasoning_content` in `OpenAIAdapter` when
   `options.thinkingLevel` is enabled and differs from `none`.
9. Cover the full tool round-trip with runtime and adapter tests.

## Test Matrix

Required coverage:

- `ChatPreparationPipeline`
  - reasoning model with omitted options receives default thinking level
  - explicit `thinkingLevel: "none"` is preserved
  - non-reasoning model strips thinking options
- `DefaultRequestMaterializer`
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
