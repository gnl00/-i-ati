# Scenarios

这份文档给 `next` 提供最小的时序真值表。

目标不是描述完整实现，而是固定几条最关键的 contract：

- input
- events
- transcript mutation
- final result
- host-visible effect

## 1. tool round-trip

### input

- `HostRunRequest`
- `NextAgentRuntime`
  - 为本次 run 生成或分配 `LoopRunDescriptor`
  - 提供共享的 `RuntimeInfrastructure`
  - 通过 `AgentLoopDependenciesFactory` 收敛本轮 `AgentLoopDependencies`
- `LoopInputBootstrapper`
  - 把 `HostRunRequest + LoopRunDescriptor + RuntimeInfrastructure + UserRecordMaterializer + InitialTranscriptMaterializer + AgentRequestSpec` 规范化成 `AgentLoopInput`
  - 负责通过显式注入的 `UserRecordMaterializer` 和 `InitialTranscriptMaterializer` 把首条 `user` record 写入起始 `AgentTranscript`
- `AgentLoopInput`
  - 包含起始 `AgentTranscript`
  - 包含整轮 run 共享的 `AgentRequestSpec`

### events

1. `step.started`
2. `step.delta` 若干
3. `step.completed`
4. `tool.execution_progress`:
   - 成功路径示例：`started -> completed`
   - 失败或取消路径可为：`started -> failed` 或 `started -> aborted`
5. 下一次模型请求开始时，再发下一轮 `step.started`

### transcript mutation

1. 第一个 `AgentStep` 完成后：
   - loop 先通过 `AgentStepMaterializer` 把当前 `AgentStepDraft` 收成稳定 `AgentStep`
   - loop 通过 `AssistantStepRecordMaterializer` 生成一条 `assistant_step` record
   - loop 通过 `AgentTranscriptAppender` 把它写回 live transcript
2. 在 tool 执行前，loop 可以短暂把 draft 标成 `awaiting_tools`
   - 这只是内部过渡态，不能直接 materialize
   - 如果当前 step 需要进入 stable event / transcript write-back 链，必须先推进到 `completed`
3. 在 tool 执行前，loop 先完成执行桥接：
   - 收集当前 step 中的 `tool_call_ready`
   - 先提炼成 `ToolCallReadyFact`
   - `ReadyToolCallMaterializer` 把它们转成 `ReadyToolCall`
   - `ToolBatchAssembler` 组装出 `ToolBatch`
4. `ToolExecutorDispatcher` 执行 `ToolBatch`
   - 返回 `completed` `ToolDispatchOutcome`
5. loop 把 outcome 中的 `ToolResultFact[]` 通过 `ToolResultRecordMaterializer` 写回 transcript：
   - 先生成一条或多条 `tool_result` record
   - 再通过 `AgentTranscriptAppender` 追加进 live transcript
6. loop 基于最新 transcript 重新构造下一次协议请求：
   - `RequestMaterializer` 产出 `MaterializedProtocolRequest`
   - `ExecutableRequestAdapter` 把它适配成真实可发请求
   - `ModelStreamExecutor` 真正执行请求并返回 `ModelResponseStream`
7. provider response 进入 loop 前：
   - `ModelResponseParser` 基于 parser state 和当前累计 `toolCalls` 解析 `ModelResponseChunk`
   - 产出 `AgentStepDraftDelta[]` 和新的 parser state
8. loop 基于最新 transcript 发起下一个 `AgentStep`

终态补充：

- 如果 `ToolExecutorDispatcher` 返回 `failed` / `aborted` `ToolDispatchOutcome`
  - loop 应优先进入 terminal decision
  - 只有 outcome 显式携带的 `partialResults` 才允许先写回 transcript
  - 不应伪造不存在的 `tool_result` record

### final result

- `AgentLoopResult`
  - 包含最终完成的 `AgentStep`
  - 包含通过 `AgentTranscriptSnapshotMaterializer` 生成的完整 `AgentTranscriptSnapshot`
  - transcript 中至少有：
    - 初始 `user`
    - 第一个 `assistant_step`
    - `tool_result`
    - 后续继续推理得到的最终 `assistant_step`

### host-visible effect

- 宿主通过 `events/` 感知运行中状态
- 是否显示中间 step，由 `host/output/` 决定
- core 不保证中间 step 一定对用户可见

## 2. tool result then final answer

### input

- `HostRunRequest`
- `NextAgentRuntime`
  - 为本次 run 生成或分配 `LoopRunDescriptor`
  - 提供共享的 `RuntimeInfrastructure`
  - 通过 `AgentLoopDependenciesFactory` 收敛本轮 `AgentLoopDependencies`
- `LoopInputBootstrapper`
  - 消费 `LoopRunDescriptor + RuntimeInfrastructure + UserRecordMaterializer + InitialTranscriptMaterializer`，产出包含首条 `user` record 的 `AgentLoopInput`
- `AgentLoopInput`
  - 包含起始 `AgentTranscript`
  - 包含整轮 run 共享的 `AgentRequestSpec`

### events

1. `step.started`
2. `step.delta` 若干
3. `step.completed`
4. `tool.execution_progress`:
   - 成功路径示例：`started -> completed`
   - 失败或取消路径可为：`started -> failed` 或 `started -> aborted`
5. 下一轮 `step.started`
6. 下一轮 `step.completed`
7. `loop.completed`

### transcript mutation

1. 当前 `AgentStep` 完成后：
   - loop 先通过 `AgentStepMaterializer` 把当前 `AgentStepDraft` 收成稳定 `AgentStep`
   - loop 通过 `AssistantStepRecordMaterializer` 生成一条 `assistant_step` record
   - loop 通过 `AgentTranscriptAppender` 把它写回 live transcript
2. 在 tool 执行前，loop 可以短暂把 draft 标成 `awaiting_tools`
   - 这只是内部过渡态，不能直接 materialize
   - 如果当前 step 需要进入 stable event / transcript write-back 链，必须先推进到 `completed`
3. 在 tool 执行前，loop 先完成执行桥接：
   - 收集当前 step 中的 `tool_call_ready`
   - 先提炼成 `ToolCallReadyFact`
   - `ReadyToolCallMaterializer` 产出 `ReadyToolCall`
   - `ToolBatchAssembler` 组装 `ToolBatch`
4. `ToolExecutorDispatcher` 执行 `ToolBatch`
   - 返回 `completed` `ToolDispatchOutcome`
5. loop 把 outcome 中的 `ToolResultFact[]` 通过 `ToolResultRecordMaterializer` 生成 `tool_result` records
6. loop 再通过 `AgentTranscriptAppender` 写回 live transcript
7. loop 通过 `RequestMaterializer` 重新构造包含 `tool_result` 的 `MaterializedProtocolRequest`
8. `ExecutableRequestAdapter` 把协议请求适配成真实模型调用请求
9. `ModelStreamExecutor` 真正执行请求并返回 `ModelResponseStream`
10. provider response 由 `ModelResponseParser` 基于 parser state 和累计 `toolCalls` 解析 `ModelResponseChunk` 成下一轮 step facts
11. 模型在下一轮 `AgentStep` 中给出最终回答，不再继续调用工具

终态补充：

- 如果 dispatcher 在这一步返回 `failed` / `aborted`
  - loop 不应继续 request reconstruction
  - 应先根据 outcome 决定是否进入 `loop.failed` / `loop.aborted`
  - denied `ToolResultFact` 不属于这里的 terminal failure；它仍然走正常 write-back + 下一轮模型推理

### final result

- `AgentLoopResult`
  - 以收到 tool result 后的最终 assistant step 收口
  - transcript 由 `AgentTranscriptSnapshotMaterializer` 在 terminal 处收成终态快照
  - transcript 中包含：
    - 初始 `user`
    - tool 前的 `assistant_step`
    - `tool_result`
    - 最终回答对应的 `assistant_step`

### host-visible effect

- 宿主可以显示最后一个可见 step
- 也可以只显示最终 assistant step
- 具体显示策略属于 `host/output/`，不属于 loop

## 3. abort during streaming

### input

- loop 已通过：
  - `RequestMaterializer`
  - `ExecutableRequestAdapter`
  - `ModelStreamExecutor`
  - `ModelResponseParser`
  进入某个 `AgentStep` 的 `ModelResponseStream` 消费过程
- 外部触发 abort

### events

1. `step.started`
2. `step.delta` 若干
3. `loop.aborted`

可选补充：

- 如果需要让宿主清理当前显示态，`loop.aborted` 应至少带：
  - `activeStepId`
  - 当前终止原因
  - draft disposition

### transcript mutation

- streaming 中的 draft 默认不直接进入 transcript
- 只有已经通过 `AgentStepMaterializer` materialize 的稳定 `AgentStep` 才进入 transcript
- 因此：
  - 如果 abort 发生在 draft 阶段，默认不追加新的 `assistant_step`
  - 如果 abort 前某个 step 已经稳定完成，它保留在 transcript 中

### final result

- `AgentLoopResult`
  - 终态为 `aborted`
  - 包含由 `AgentTranscriptSnapshotMaterializer` 生成的、abort 发生前最后稳定下来的 transcript
  - 不把半流式 draft 冒充成稳定结果

### host-visible effect

- 宿主收到 `loop.aborted`
- 宿主可以清理 streaming UI，或把当前显示态标记为已中断
- 是否保留部分草稿展示，属于 host 决策，不属于 transcript contract

## 4. confirmation denied

### input

- `HostRunRequest`
- `LoopInputBootstrapper`
  - 已消费 `LoopRunDescriptor + RuntimeInfrastructure + UserRecordMaterializer + InitialTranscriptMaterializer`，生成本轮 `AgentLoopInput`
- 某个 tool 的 `ToolConfirmationPolicy` 要求执行前确认
- 外部确认结果为拒绝

### events

1. `tool.awaiting_confirmation`
2. `tool.confirmation_denied`

### transcript mutation

- `tool.awaiting_confirmation` 不进入 transcript
- dispatcher / approval flow 应产出稳定的 denied `ToolResultFact`
- loop 通过 `ToolResultRecordMaterializer` 生成 denied `tool_result` record
- loop 再通过 `AgentTranscriptAppender` 写回 live transcript
- loop 将这条 `tool_result` 通过 `RequestMaterializer` 回传到新的 `MaterializedProtocolRequest`
- `ExecutableRequestAdapter` 把它适配成真实模型调用请求
- `ModelStreamExecutor` 真正执行请求并返回 response stream
- `ModelResponseParser` 继续把 `ModelResponseChunk` 解析成下一轮 step facts，让模型决定下一步

终态补充：

- denied 分支本身不等于 loop terminal
- 只有 approval / dispatcher 自身进入无法恢复的 `failed` / `aborted` outcome，loop 才应转入 terminal

### final result

- loop 继续下一轮 `AgentStep`
- 模型可以基于 denied/aborted `tool_result` 改变计划、换工具，或直接给出文本响应
- 最终 transcript 仍应在 terminal 处通过 `AgentTranscriptSnapshotMaterializer` 收成快照

### host-visible effect

- 宿主通过事件感知“等待确认”和“确认被拒绝”
- 是否把拒绝结果显示为消息、状态条或静默处理，属于 `host/output/`
