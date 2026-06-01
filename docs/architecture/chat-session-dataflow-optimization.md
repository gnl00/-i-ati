# Chat Session Dataflow Optimization

> Investigation date: 2026-06-01
> Scope: host submit -> agent input -> context assembly -> unified request -> unified response -> save / compact / tool call continuation.

## Current Request Dataflow

```text
Host submit
  -> RunService.start/execute
  -> RunManager
  -> AgentRun
  -> ChatAgentAdapter.prepareRun
  -> ChatPreparationPipeline
     -> RunEnvironmentService
        -> AppConfigStore
        -> ChatModelContextResolver
        -> ChatSessionStore.resolveOrCreateChat()
        -> ChatSessionStore.loadHistoryMessages()
     -> StepBootstrapService
        -> ChatStepStore.createUserMessage()
        -> ChatStepStore.buildAssistantDraft()
     -> RunRequestFactory
        -> SystemPromptComposer
        -> SystemEnvironmentContextProvider
        -> LoadedSkillsContextProvider
        -> KnowledgebaseContextProvider
        -> AwakeContextProvider
        -> RequestMessageBuilder
           -> apply compression
           -> filter invalid messages
           -> strip historical inline images
           -> repair tool pairs
           -> insert ephemeral context
           -> insert user instruction
           -> validate messages
        -> UnifiedRequestMessageMaterializer
        -> IUnifiedRequest
  -> DefaultMainAgentRuntimeRunner
     -> DefaultMainAgentHostRequestBuilder
        -> HostRunRequest.metadata.initialMessages
     -> MainAgentLoopInputBootstrapper
        -> ChatMessage[] to AgentTranscript
  -> AgentLoop
     -> RequestMaterializer
        -> AgentTranscript to MaterializedProtocolRequest
     -> ExecutableRequestAdapter
        -> MaterializedProtocolRequest to IUnifiedRequest
     -> ModelStreamExecutor
     -> unifiedChatRequest
     -> request adapter
     -> fetch
```

### Request Call Flow

```text
RunService
  RunManager
    AgentRun
      ChatAgentAdapter.prepareRun
        ChatPreparationPipeline.prepare
          RunEnvironmentService.prepare
          StepBootstrapService.bootstrap
          RunRequestFactory.build
      DefaultMainAgentRuntimeRunner.run
        DefaultMainAgentHostRequestBuilder.build
        DefaultAgentRuntime.run
          MainAgentLoopInputBootstrapper.bootstrap
          DefaultAgentLoop.run
            RequestMaterializer.materialize
            ExecutableRequestAdapter.adapt
            DefaultModelStreamExecutor.execute
              unifiedChatRequest
```

## Current Response Dataflow

```text
provider raw SSE/json
  -> request adapter parseStreamResponse/parseResponse
  -> IUnifiedResponse
  -> ModelStreamExecutor
     -> ModelResponseChunk
  -> ModelResponseParser
     -> AgentStepDraftDelta
  -> AgentStepDraft
  -> AgentEventBus
  -> HostRenderEventForwarder
     -> HostRenderEventMapper
     -> AgentRenderStateReducer
     -> HostRenderEvent
  -> ChatRenderResponder
     -> HostRenderStateController
     -> ChatRenderOutput
        -> preview.updated / preview.patch
        -> committed.updated
        -> tool result persistence
  -> AgentLoop
     -> assistant step record append
     -> tool result record append
     -> loaded skills context refresh after load_skill/unload_skill
  -> RunFinalizer
     -> ChatFinalizeService
     -> post-run title/compression jobs
```

### Response Call Flow

```text
unifiedChatRequest
  request adapter
    parseStreamResponse / parseResponse
  DefaultModelStreamExecutor
    normalizeStreamingResponse / normalizeSingleResponse
  DefaultAgentLoop
    ModelResponseParser.parse
    applyDeltaToDraft
    agentEventEmitter.emitStepDelta
    agentStepMaterializer.materialize
    assistantStepRecordMaterializer.materialize
    transcriptAppender.append
    toolExecutorDispatcher.dispatch
    toolResultRecordMaterializer.materialize
  HostRenderEventForwarder
    HostRenderEventMapper.map
    ChatRenderResponder.handle
    ChatRenderOutput.emitPreview / commitAssistantMessage / appendToolResult
  RunFinalizer.handleRuntimeResult
```

## Active Data Shapes

```text
MessageEntity / ChatMessage
  - DB and host UI message shape.
  - Owns persisted user messages, assistant messages, hidden context carriers, tool result messages, preview payloads.

RequestMessageBuildResult
  - Preparation-side canonical chat message list after compression and context insertion.
  - Feeds current initialMessages.

IUnifiedRequest
  - Provider-adapter boundary.
  - Current preparation code builds it once, then runtime builds another executable instance before dispatch.

AgentTranscript
  - Runtime protocol history.
  - Owns same-run assistant/tool continuation state.
  - Drives every model continuation after bootstrap.

MaterializedProtocolRequest
  - Runtime protocol request before conversion to IUnifiedRequest.
  - Keeps typed user parts until ExecutableRequestAdapter maps them to unified content.

IUnifiedResponse / ModelResponseChunk / AgentStepDraftDelta
  - Provider response normalization, runtime chunk normalization, and step-level facts.

HostRenderEvent / AgentRenderMessageState
  - Host projection layer for preview, committed message, lifecycle, usage, and tool display state.
```

## Redundant Or High-Friction Steps

### 1. Preparation Builds Provider Messages That Runtime Rebuilds

`RunRequestFactory.build()` creates `request.messages` through:

```text
RequestMessageBuilder
  -> UnifiedRequestMessageMaterializer
  -> IUnifiedRequest.messages
```

The actual dispatch path later uses:

```text
initialMessages
  -> MainAgentLoopInputBootstrapper
  -> AgentTranscript
  -> RequestMaterializer
  -> ExecutableRequestAdapter
  -> IUnifiedRequest.messages
```

The second path is the effective dispatch path. This means the preparation-side `IUnifiedRequest.messages` has low ownership value and increases drift risk.

### 2. `RunSpec.request` Mixes Request Spec And Executable Request

`RunSpec.request` currently stores an `IUnifiedRequest`. Runtime then extracts only request-spec fields through `toRequestSpec()`:

```text
adapterPluginId
baseUrl
apiKey
model
modelType
systemPrompt
userInstruction
tools
stream
requestOverrides
options
```

`messages` remains outside the effective send path because runtime uses `initialMessages` and `AgentTranscript`.

### 3. Tool Result Compaction Policy Appears In Multiple Request Materializers

Tool result content compaction exists in both preparation and runtime materialization paths:

```text
UnifiedRequestMessageMaterializer
RequestMaterializer
```

Runtime materialization is the effective model-send path. A shared tool-result model-content policy would make this easier to reason about.

### 4. User Instruction Has Two Carriers

`RequestMessageBuilder` inserts a `<user_instruction>` user message. `RunRequestFactory` also stores `userInstruction` on the request object. Provider adapters may interpret request-level user instruction independently from message history. This needs an explicit contract:

```text
request-level userInstruction: request metadata / adapter option
message-level <user_instruction>: model-visible context in transcript history
```

## Necessary Boundaries

Keep these boundaries stable:

- `MessageEntity / ChatMessage` for DB, renderer, host-facing events, and hidden carrier messages.
- `AgentTranscript` for runtime continuation and tool-call feedback.
- `IUnifiedRequest / IUnifiedResponse` for provider adapter plugins.
- `HostRenderEvent` and `AgentRenderStateReducer` for shared chat / telegram rendering semantics.
- Hidden context messages for compression, skills, knowledgebase, awake, system environment, and run-stop boundaries.
- `preview.updated` and `committed.updated` split for assistant rendering stability.

## Optimization Proposal

### Step 1: Split Request Spec From Executable Unified Request

Target shape:

```ts
type MainAgentRequestSpec = {
  adapterPluginId: string
  baseUrl: string
  apiKey: string
  model: string
  modelType?: string
  systemPrompt?: string
  userInstruction?: string
  tools?: unknown[]
  stream?: boolean
  requestOverrides?: Record<string, unknown>
  options?: AgentRequestOptions
}
```

`RunSpec` should carry:

```ts
{
  submissionId: string
  modelContext: RunModelContext
  requestSpec: MainAgentRequestSpec
  initialMessages: ChatMessage[]
  runtimeContext: ...
}
```

Expected effects:

- `DefaultMainAgentRuntimeRunner.toRequestSpec()` becomes a thin pass-through or disappears.
- `RunSpec` communicates that executable provider messages are generated inside runtime.
- Tests can assert request-spec fields and initial messages independently.

### Step 2: Return Initial Messages And Request Spec From `RunRequestFactory`

Target preparation output:

```ts
type RunRequestBuildResult = {
  requestSpec: MainAgentRequestSpec
  initialMessages: ChatMessage[]
}
```

`RunRequestFactory.build()` continues to own:

```text
system prompt composition
compression summary resolution
ephemeral context assembly
RequestMessageBuilder build
tool list building
thinking option resolution
```

`RunRequestFactory.build()` can return the request spec and initial messages directly. `UnifiedRequestMessageMaterializer` can move out of the main chat run path after tests are updated.

Expected effects:

- The request path has one model-message materialization source: runtime transcript.
- `initialMessages` remains canonical for bootstrap and includes compression/context repair effects.
- Preparation keeps provider credentials and model options in a request spec.

## Suggested Implementation Order

1. Introduce a request-spec type and update `RunSpec`.
2. Update `DefaultMainAgentRuntimeRunner` to use `prepared.runSpec.requestSpec`.
3. Update `RunRequestFactory` return shape to `{ requestSpec, initialMessages }`.
4. Update `ChatPreparationPipeline` to store `runSpec.requestSpec` and `runSpec.initialMessages`.
5. Remove preparation-side `UnifiedRequestMessageMaterializer` usage from chat run preparation.
6. Update tests around `ChatPreparationPipeline`, `RunService`, `DefaultMainAgentRuntimeRunner`, and request message building.
7. Evaluate follow-up removal or relocation of `UnifiedRequestMessageMaterializer` after confirming external callers.

## Verification Targets

Minimum focused tests:

```text
pnpm test:run src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts
pnpm test:run src/main/orchestration/chat/run/runtime/__tests__/DefaultMainAgentRuntimeRunner.integration.test.ts
pnpm test:run src/shared/services/__tests__/RequestMessageBuilder.test.ts
pnpm test:run src/main/agent/runtime/transcript/__tests__/RequestMaterializer.test.ts
pnpm test:run src/main/agent/runtime/model/__tests__/ExecutableRequestAdapter.test.ts
```

Broader confidence:

```text
pnpm test:run src/main/orchestration/chat/run/__tests__/RunService.test.ts
pnpm test:run src/main/orchestration/chat/run/runtime/__tests__/AgentRun.test.ts
pnpm test:run src/main/orchestration/chat/run/runtime/__tests__/AgentRunCompletionAdapter.test.ts
pnpm test:run src/main/agent/runtime/__tests__/AgentRuntime.test.ts
```

## Open Questions

- Should request-level `userInstruction` remain in `AgentRequestSpec` after message-level insertion, or should adapters treat only `systemPrompt + messages` as model-visible input?
- Should `UnifiedRequestMessageMaterializer` remain as a utility for non-runtime callers such as title/compression/smart message paths?
- Should bootstrap evolve from `ChatMessage[]` to `AgentTranscriptRecord[]` so preparation produces a direct runtime seed?
- Should `StepResult.requestHistoryMessages` remain part of `StepResult`, or move into debug artifacts?
