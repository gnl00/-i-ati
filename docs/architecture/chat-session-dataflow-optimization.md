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
        -> RunRequestBuildResult
           -> requestSpec
           -> initialTranscriptSeed
  -> DefaultMainAgentRuntimeRunner
     -> DefaultMainAgentHostRequestBuilder
        -> HostRunRequest.metadata.initialTranscriptSeed
     -> MainAgentLoopInputBootstrapper
        -> ChatInitialTranscriptRecordFactory
           -> ChatInitialTranscriptSeed[] to AgentTranscriptRecord[]
        -> InitialTranscriptMaterializer
           -> AgentTranscript
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
     -> transcript record factory write-back
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
    transcriptRecordFactory.createAssistantStep
    transcriptAppender.append
    toolExecutorDispatcher.dispatch
    transcriptRecordFactory.createToolResult
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
  - Feeds preparation-side transcript seed creation.

ChatInitialTranscriptSeed
  - Preparation-to-runtime bootstrap carrier.
  - Carries user, assistant, and tool history records after ChatMessage-specific fields have been projected.

IUnifiedRequest
  - Provider-adapter boundary.
  - Runtime builds the executable instance immediately before dispatch.

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

### 1. Preparation Provider Message Pre-Materialization

Earlier `RunRequestFactory.build()` created `request.messages` through:

```text
RequestMessageBuilder
  -> UnifiedRequestMessageMaterializer
  -> IUnifiedRequest.messages
```

`UnifiedRequestMessageMaterializer` was a legacy preparation-side projection and has been deleted after production callers reached zero.

The actual dispatch path later uses:

```text
initialTranscriptSeed
  -> DefaultMainAgentHostRequestBuilder
  -> HostRunRequest.metadata.initialTranscriptSeed
  -> MainAgentLoopInputBootstrapper
  -> AgentTranscript
  -> RequestMaterializer
  -> ExecutableRequestAdapter
  -> IUnifiedRequest.messages
```

The runtime path is now the dispatch path. Preparation returns `initialTranscriptSeed` and `requestSpec`, and runtime generates `IUnifiedRequest.messages`.

Phase 1 extracted bootstrap conversion into `ChatInitialTranscriptRecordFactory`, phase 2 narrowed the host runtime carrier to `ChatInitialTranscriptSeed[]`, and phase 3 moved seed creation into preparation:

```text
RunRequestFactory
  -> InitialTranscriptSeedBuilder
  -> RunSpec.initialTranscriptSeed
  -> DefaultMainAgentHostRequestBuilder
  -> HostRunRequest.metadata.initialTranscriptSeed
```

Runtime bootstrap consumes the prepared seed:

```text
HostRunRequest.metadata.initialTranscriptSeed
  -> MainAgentLoopInputBootstrapper
  -> ChatInitialTranscriptRecordFactory
     -> user / assistant_step / tool_result records
  -> InitialTranscriptMaterializer
  -> AgentTranscript
```

`RunRequestFactory` maps preparation `ChatMessage[]` into transcript seed records through `InitialTranscriptSeedBuilder`. Reasoning is extracted from assistant message segments during this mapping. `DefaultMainAgentHostRequestBuilder` passes `RunSpec.initialTranscriptSeed` into host runtime metadata. `MainAgentLoopInputBootstrapper` keeps transcript container assembly and fallback user-record materialization when empty initial records arrive. `ChatInitialTranscriptRecordFactory` owns seed-to-transcript conversion details: user content parts, assistant content/tool calls, assistant step indexing, and tool result projection through `projectToolResultContentForHistoryImport()`.

### 2. Request Spec And Executable Request Boundary

Earlier `RunSpec.request` stored an `IUnifiedRequest`. Runtime extracted only request-spec fields:

```text
adapterPluginId
baseUrl
apiKey
model
modelType
systemPrompt
tools
stream
requestOverrides
options
```

`RunSpec.requestSpec` now carries these fields directly. Bootstrap history stays in `initialTranscriptSeed` and `AgentTranscript` until runtime materialization.

### 3. Tool Result Compaction Policy Sits In Runtime Request Materialization

Tool result content compaction is applied in runtime materialization:

```text
RequestMaterializer
```

Runtime materialization is the effective model-send path. The canonical path is:

```text
RequestMessageBuilder
  -> InitialTranscriptSeedBuilder
  -> initialTranscriptSeed
  -> InitialTranscriptMaterializer
  -> AgentTranscript
  -> RequestMaterializer
  -> IUnifiedRequest.messages
```

Tool result model-content projection is now concentrated in the runtime request path.

### 4. User Instruction Carrier

`RequestMessageBuilder` inserts a `<user_instruction>` user message during preparation. That message becomes part of `initialTranscriptSeed`, enters `AgentTranscript`, and reaches the final provider request through `IUnifiedRequest.messages`.

```text
runtime model-visible input = systemPrompt + messages + tools + options
user instruction carrier = message-level <user_instruction>
IUnifiedRequest.userInstruction = deprecated plugin compatibility metadata
```

`RunRequestFactory.mergeRequestUserInstruction()` still combines chat-level instruction with schedule execution context. The merged value is passed only to `RequestMessageBuilder.setUserInstruction()`.

### 5. Response-Side Carrier Trim

Implemented response-side cleanup:

```text
RunResult
  -> StepResult.requestHistoryMessages removed

RunStepResponse
  -> raw lifecycle narrowed to response normalization boundary

StepResult
  -> artifacts removed from response carrier

ToolResultContentProjector
  -> model mode
  -> history import mode
  -> display mode

AgentLoopDependencies
  -> transcriptRecordFactory
     -> createAssistantStep
     -> createToolResult
```

Effects:

- Runtime continuation reads from `AgentTranscript`.
- Response carriers hold current step output and provider boundary facts.
- Tool result content projection is named by consumer.
- Transcript write-back has one factory dependency for assistant steps and tool results.

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

Implemented shape:

```ts
type MainAgentRequestSpec = {
  adapterPluginId: string
  baseUrl: string
  apiKey: string
  model: string
  modelType?: string
  systemPrompt?: string
  tools?: unknown[]
  stream?: boolean
  requestOverrides?: Record<string, unknown>
  options?: AgentRequestOptions
}
```

`RunSpec` carries:

```ts
{
  submissionId: string
  modelContext: RunModelContext
  requestSpec: MainAgentRequestSpec
  initialTranscriptSeed: ChatInitialTranscriptSeed[]
  runtimeContext: ...
}
```

Expected effects:

- `DefaultMainAgentRuntimeRunner.toRequestSpec()` becomes a thin pass-through or disappears.
- `RunSpec` communicates that executable provider messages are generated inside runtime.
- Tests can assert request-spec fields and initial transcript seed independently.

### Step 2: Return Initial Messages And Request Spec From `RunRequestFactory`

Implemented preparation output:

```ts
type RunRequestBuildResult = {
  requestSpec: MainAgentRequestSpec
  initialTranscriptSeed: ChatInitialTranscriptSeed[]
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

`RunRequestFactory.build()` returns the request spec and initial transcript seed directly. The deleted legacy `UnifiedRequestMessageMaterializer` is outside the main chat run path history.

Expected effects:

- The request path has one model-message materialization source: runtime transcript.
- `initialTranscriptSeed` is the preparation output and includes compression/context repair effects. Host runtime metadata receives the prepared seed through host request builder passthrough.
- Preparation keeps provider credentials and model options in a request spec.

## Suggested Implementation Order

1. Introduce a request-spec type and update `RunSpec`.
2. Update `DefaultMainAgentRuntimeRunner` to use `prepared.runSpec.requestSpec`.
3. Update `RunRequestFactory` return shape to `{ requestSpec, initialTranscriptSeed }`.
4. Update `ChatPreparationPipeline` to store `runSpec.requestSpec` and `runSpec.initialTranscriptSeed`.
5. Removed preparation-side `UnifiedRequestMessageMaterializer` usage from chat run preparation.
6. Update tests around `ChatPreparationPipeline`, `RunService`, `DefaultMainAgentRuntimeRunner`, and request message building.
7. Deleted legacy `UnifiedRequestMessageMaterializer` after confirming external callers are gone.

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

## Resolved Contract

- Runtime request generation treats `systemPrompt + messages + tools + options` as the model-visible input surface.
- `userInstruction` is materialized as a `<user_instruction>` user message before the current user message.
- `AgentRequestSpec`, `MaterializedProtocolRequest`, and runtime-created `IUnifiedRequest` omit active `userInstruction` pass-through.
- `StepResult` omits historical request messages and artifact payloads.
- Provider `raw` data has a short response-normalization lifecycle.
- `ToolResultContentProjector` owns model replay / history import / display projection modes.
- `InitialTranscriptSeedBuilder` owns `ChatMessage[]` to `ChatInitialTranscriptSeed[]` mapping during preparation.
- `DefaultMainAgentHostRequestBuilder` owns `RunSpec.initialTranscriptSeed` passthrough to host runtime metadata.
- `ChatInitialTranscriptRecordFactory` owns `ChatInitialTranscriptSeed[]` to `AgentTranscriptRecord[]` conversion during bootstrap.
- `TranscriptRecordFactory` owns assistant_step and tool_result write-back record creation.
- Legacy `UnifiedRequestMessageMaterializer` is deleted. Canonical model-message materialization flows through `RequestMessageBuilder -> AgentTranscript -> RequestMaterializer`.

## Open Questions

- Should transcript bootstrap move closer to preparation so runtime starts from protocol records directly?
- Should response debug capture get an explicit artifact channel outside `StepResult`?
