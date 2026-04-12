# Type Checklist

这份文档把 `SCENARIOS.md` 里的场景，映射到当前 runtime 已经定义的 contract。

目标不是替代时序文档，而是回答两个问题：

1. 每个场景会碰到哪些类型
2. 这些类型后续最需要补哪些字段

## 1. tool round-trip

### 会涉及的 contract

- `host/bootstrap/HostRunRequest`
- `host/bootstrap/LoopInputBootstrapper`
- `runtime/AgentRuntime`
- `runtime/AgentRuntimeRunInput`
- `runtime/AgentRuntimeContext`
- `runtime/AgentLoopDependenciesFactory`
- `runtime/RuntimeInfrastructure`
- `loop/AgentLoopInput`
- `loop/AgentLoopDependencies`
- `loop/LoopIdentityProvider`
- `loop/RuntimeClock`
- `loop/LoopRunDescriptor`
- `loop/LoopExecutionConfig`
- `loop/AgentLoop`
- `loop/AgentLoopResult`
- `request/AgentRequestSpec`
- `step/AgentStepDraft`
- `step/AgentStep`
- `step/AgentStepMaterializer`
- `tools/ToolBatch`
- `tools/ToolCallReadyFact`
- `tools/ReadyToolCall`
- `tools/ReadyToolCallMaterializer`
- `tools/ToolBatchAssembler`
- `tools/ToolDispatchOutcome`
- `tools/ToolExecutorDispatcher`
- `events/AgentEventEmitter`
- `events/StepEvent`
- `events/ToolEvent`
- `transcript/AgentTranscript`
- `transcript/AgentTranscriptRecord`
- `transcript/UserRecordMaterializer`
- `transcript/InitialTranscriptMaterializer`
- `transcript/AgentTranscriptAppender`
- `transcript/AgentTranscriptSnapshotMaterializer`
- `transcript/RequestMaterializer`
- `runtime/model/ExecutableRequestAdapter`
- `runtime/model/ModelResponseChunk`
- `runtime/model/ModelResponseStream`
- `runtime/model/ModelStreamExecutor`
- `runtime/model/ModelResponseParser`
- `host/output/HostStepOutput`

### 这一组最需要补的字段

- `AgentLoopInput`
  - run descriptor / transcript / request spec / abort signal
- `AgentLoopDependencies`
  - loop 真正直接消费的 model/tool/transcript/event bridges，以及稳定标识/时间来源
- `LoopIdentityProvider`
  - `stepId` / `recordId` / `batchId` 的稳定分配来源
- `RuntimeClock`
  - `timestamp` / `createdAt` 等时间字段的稳定来源
- `LoopRunDescriptor`
  - runId 等本次 run 的稳定标识
- `LoopExecutionConfig`
  - step limit 等稳定执行配置
- `AgentRequestSpec`
  - auth / baseUrl / provider routing fields
- `LoopInputBootstrapper`
  - 外部 run 标识 / 首条 user record / 初始 transcript 的装配规则
  - typed content parts 的保留规则
  - 稳定执行配置如何进入 `AgentLoopInput`
  - 起始 `transcriptId` / `recordId` / `createdAt` / `updatedAt` / `timestamp` 应显式来自共享的 `RuntimeInfrastructure`
  - `UserRecordMaterializer` 和 `InitialTranscriptMaterializer` 应作为显式 runtime wiring 依赖注入
- `UserRecordMaterializer`
  - 负责 bootstrap 阶段的首条 `user` record 生成
- `InitialTranscriptMaterializer`
  - 负责 bootstrap 阶段的初始 `AgentTranscript` 容器生成
  - `updatedAt` 应显式输入，不应在 materializer 内部隐式假定
- `AgentRuntime`
  - run descriptor 的生成或分配规则
  - 每次 run 的 host 输入如何进入 runtime 主链
  - host run request / execution / signal 如何进入 runtime run 入口
- `AgentLoopDependenciesFactory`
  - 把 runtime 已持有的 bridges / providers / event emitter 收敛成 `AgentLoopDependencies`
- `AgentStepDraft`
  - step id / status / typed deltas / tool calls / usage
  - `content_delta` / `reasoning_delta` / `tool_call_started` / `tool_call_ready` / `finish_reason` / `usage_delta` / `response_metadata`
  - `tool_call_started` 用于开始渲染 tool call
  - `tool_call_ready` 用于标记这条 tool call 已完整可执行
  - `awaiting_tools` 只是 loop 内部短暂过渡态，不能直接进入 materialize
- `AgentStep`
  - finish reason / tool calls / usage / raw response metadata
- `AgentStepMaterializer`
  - 负责 `AgentStepDraft -> AgentStep`
  - 应显式承接 `completedAt` / `raw` / `failure` / `abortReason`
  - 应只接受 `completed | failed | aborted` draft
  - `failed` 必须带 `failure`，`aborted` 必须带 `abortReason`
- `ToolBatch`
  - tool call list / stable ordering / execution status
- `ToolCallReadyFact`
  - 从 `tool_call_ready` 提炼出来、供 tools 层消费的稳定事实
- `ReadyToolCall`
  - `tool_call_ready` materialize 后进入 batch 组装的稳定输入
- `ReadyToolCallMaterializer`
  - 负责 `ToolCallReadyFact -> ReadyToolCall` 的单一转换入口
- `ToolBatchAssembler`
  - 只消费 ready tool calls
  - 负责 batch id / confirmation policy 绑定 / stable ordering
- `ToolDispatchOutcome`
  - `completed` / `failed` / `aborted`
  - 决定后续是 transcript write-back 还是 loop terminal
- `AgentEventEmitter`
  - 负责把 runtime facts 组装成稳定 `AgentEvent`
  - loop 不应直接手写 event union payload
- `AssistantStepRecordMaterializer`
  - 负责 `AgentStep -> AgentTranscriptAssistantStepRecord`
- `AgentTranscriptAppender`
  - 负责把稳定 records 追加进 live transcript，并推进 `updatedAt`
- `AgentTranscriptSnapshotMaterializer`
  - 负责把 live transcript 收成终态 `AgentTranscriptSnapshot`
- `AgentTranscriptRecord`
  - `kind`、record id、timestamp、payload
- `ToolResultRecordMaterializer`
  - 负责 `ToolResultFact -> AgentTranscriptToolResultRecord`
- `AgentContentPart`
  - `input_text` / `input_image` / `input_file` 以及 file metadata
- `AgentLoopResult`
  - final status / final step id / `AgentTranscriptSnapshot` / usage summary
- `ExecutableRequestAdapter`
  - typed user content parts -> 当前 `IUnifiedRequest` / `ChatMessage[]` 的保真映射
- `ModelResponseParser`
  - parser state / cumulative tool calls
  - 输出 typed `AgentStepDraftDelta[]`，而不是松散可选字段 bag
  - 累计结果应作为 `toolCallsSnapshot` 返回，避免和 tool-call 事件节点混义
  - parser state 应显式包含 think tag 状态和 tool call assembly 状态
- `ModelResponseChunk`
  - 负责在 `ModelStreamExecutor` 和 `ModelResponseParser` 之间表达规范化的单个响应块
- `ModelResponseStream`
  - 负责表达按顺序产出 `ModelResponseChunk` 的规范化响应流

## 2. tool result then final answer

### 会涉及的 contract

- `host/bootstrap/HostRunRequest`
- `host/bootstrap/LoopInputBootstrapper`
- `runtime/AgentRuntime`
- `runtime/AgentRuntimeRunInput`
- `runtime/AgentRuntimeContext`
- `runtime/AgentLoopDependenciesFactory`
- `runtime/RuntimeInfrastructure`
- `loop/AgentLoopInput`
- `loop/AgentLoopDependencies`
- `loop/LoopIdentityProvider`
- `loop/RuntimeClock`
- `loop/LoopRunDescriptor`
- `loop/LoopExecutionConfig`
- `loop/AgentLoop`
- `loop/AgentLoopResult`
- `request/AgentRequestSpec`
- `step/AgentStep`
- `step/AgentStepMaterializer`
- `tools/ToolBatch`
- `tools/ToolCallReadyFact`
- `tools/ReadyToolCall`
- `tools/ReadyToolCallMaterializer`
- `tools/ToolBatchAssembler`
- `tools/ToolDispatchOutcome`
- `tools/ToolExecutorDispatcher`
- `events/AgentEventEmitter`
- `events/StepEvent`
- `events/ToolEvent`
- `events/LoopEvent`
- `transcript/AgentTranscript`
- `transcript/AgentTranscriptRecord`
- `transcript/UserRecordMaterializer`
- `transcript/InitialTranscriptMaterializer`
- `transcript/AgentTranscriptAppender`
- `transcript/AgentTranscriptSnapshotMaterializer`
- `transcript/RequestMaterializer`
- `runtime/model/ExecutableRequestAdapter`
- `runtime/model/ModelResponseChunk`
- `runtime/model/ModelResponseStream`
- `runtime/model/ModelStreamExecutor`
- `runtime/model/ModelResponseParser`
- `host/output/HostStepOutputPolicy`
- `host/output/HostStepOutputBuilder`

### 这一组最需要补的字段

- `LoopEvent`
  - completed payload 的终态字段
- `AgentLoopResult`
  - final assistant step 与 loop terminal status 的关系
- `HostStepOutputPolicy`
  - final answer 是否可见
- `HostStepOutputBuilder`
  - 最终 assistant step 如何变成宿主输出

## 3. abort during streaming

### 会涉及的 contract

- `host/bootstrap/HostRunRequest`
- `host/bootstrap/LoopInputBootstrapper`
- `runtime/AgentRuntime`
- `runtime/AgentRuntimeRunInput`
- `runtime/AgentRuntimeContext`
- `runtime/AgentLoopDependenciesFactory`
- `runtime/RuntimeInfrastructure`
- `loop/AgentLoopInput`
- `loop/AgentLoopDependencies`
- `loop/LoopIdentityProvider`
- `loop/RuntimeClock`
- `loop/LoopRunDescriptor`
- `loop/LoopExecutionConfig`
- `loop/AgentLoop`
- `loop/AgentLoopResult`
- `step/AgentStepDraft`
- `step/AgentStepMaterializer`
- `events/AgentEventEmitter`
- `events/StepEvent`
- `events/LoopEvent`
- `transcript/AgentTranscript`
- `transcript/UserRecordMaterializer`
- `transcript/InitialTranscriptMaterializer`
- `transcript/AgentTranscriptAppender`
- `transcript/AgentTranscriptSnapshotMaterializer`
- `runtime/model/ModelStreamExecutor`
- `runtime/model/ModelResponseChunk`
- `runtime/model/ModelResponseStream`
- `runtime/model/ModelResponseParser`
- `host/output/HostStepOutputPolicy`

### 这一组最需要补的字段

- `AgentLoopInput`
  - abort signal / cancellation source
- `LoopExecutionConfig`
  - abort 之外的稳定执行约束
- `AgentStepDraft`
  - draft disposition / partial snapshot
- `LoopEvent`
  - `loop.aborted` payload:
    - active step id
    - abort reason
    - draft disposition
- `AgentLoopResult`
  - aborted status / last stable transcript / active step summary

## 4. confirmation denied

### 会涉及的 contract

- `host/bootstrap/LoopInputBootstrapper`
- `runtime/AgentRuntime`
- `runtime/AgentRuntimeRunInput`
- `runtime/AgentRuntimeContext`
- `runtime/AgentLoopDependenciesFactory`
- `runtime/RuntimeInfrastructure`
- `loop/LoopIdentityProvider`
- `loop/RuntimeClock`
- `tools/ToolConfirmationPolicy`
- `tools/ToolBatch`
- `tools/ToolExecutorDispatcher`
- `events/AgentEventEmitter`
- `events/ToolEvent`
- `step/AgentStep`
- `step/AgentStepMaterializer`
- `transcript/AgentTranscript`
- `transcript/AgentTranscriptRecord`
- `transcript/UserRecordMaterializer`
- `transcript/InitialTranscriptMaterializer`
- `transcript/AgentTranscriptAppender`
- `transcript/AgentTranscriptSnapshotMaterializer`
- `transcript/RequestMaterializer`
- `runtime/model/ExecutableRequestAdapter`
- `runtime/model/ModelResponseChunk`
- `runtime/model/ModelResponseStream`
- `runtime/model/ModelStreamExecutor`
- `runtime/model/ModelResponseParser`
- `loop/AgentLoop`
- `loop/AgentLoopResult`

### 这一组最需要补的字段

- `ToolConfirmationPolicy`
  - confirmation required / source / denied result shape
- `ToolEvent`
  - `tool.awaiting_confirmation`
  - `tool.confirmation_denied`
- `ToolResultRecordMaterializer`
  - denied `ToolResultFact` 也应通过同一条 write-back 链写入 transcript
- `AgentTranscriptRecord`
  - denied/aborted `tool_result` 的记录形态
- `AgentLoopResult`
  - denied 后继续推理时，终态如何表达

## 5. 当前还缺但值得评估的一组类型

下面这些 contract 已经被文档隐含使用，但还没有单独占位文件：

- `AbortReason`
  - 统一表达外部取消、超时、内部错误中断等原因
- `DeniedToolResult`
  - 如果后面不想只通过 `ToolDeniedResultShape` 表达拒绝结果，可以再单独抽成稳定结构

## 6. runtime 入口最小依赖

`AgentRuntimeContext` 至少应显式持有：

- `sources`
  - `AgentRequestSpecSource`
  - `LoopRunDescriptorSource`
- `bootstrap`
  - `LoopInputBootstrapper`
  - `UserRecordMaterializer`
  - `InitialTranscriptMaterializer`
- `runtime infrastructure`
  - `RuntimeInfrastructure`
- `loop`
  - `AgentLoop`
- `loop dependencies factory`
  - `AgentLoopDependenciesFactory`

`AgentRuntime` 至少应显式暴露：

- `run(input)`
  - `AgentRuntimeRunInput`
  - 内部顺序应固定为：
    - resolve `AgentRequestSpec`
    - create `LoopRunDescriptor`
    - bootstrap `AgentLoopInput`
    - create `AgentLoopDependencies`
    - run `AgentLoop`
    - return `AgentLoopResult`

## 7. 使用建议

实现当前 runtime 时，建议顺序是：

1. 先给 `AgentStepDraft`、`AgentStep`、`AgentTranscriptRecord`、`AgentLoopResult` 补稳定字段
2. 再给 `ToolConfirmationPolicy`、`ToolEvent`、`LoopEvent` 补 approval / abort 所需字段
3. 最后再补 `host/output/` 需要的最小展示字段

这样可以先把 core runtime contract 钉死，再去接 host 可见层。
