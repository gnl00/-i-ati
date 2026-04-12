# step

这一层定义单次模型请求的 runtime 单元。

`step` 是 `loop` 驱动的基本执行单位，但它本身不是 `loop` 的内部细节，因此和 `loop` 作为同级目录存在。

这里的关键约束是：

- 一个 `AgentStep` 恰好对应一次模型请求
- tool 执行完成后，如果 loop 继续推理，开始的是下一个 `AgentStep`
- 当前 runtime 不再使用 `cycle` 作为和 `step` 并列的 runtime 单元名

## 这一层负责什么

- 定义单次模型请求的稳定结果结构
- 定义单次模型请求的流式工作区
- 作为 transcript 中 assistant 记录的核心 payload

## 这一层不负责什么

- 不负责整个 loop 的编排
- 不负责 tool batch 执行
- 不直接落库
- 不直接发送 host event

## 文件说明

- `AgentStep.ts`
  - 单次模型请求的 runtime 结果对象
- `AgentStepDraft.ts`
  - 单次模型请求的流式工作区
  - 以 append-only 的 typed deltas 作为事实真源
  - snapshot 只是从这些 deltas 派生出来的缓存视图
- `AgentStepMaterializer.ts`
  - 把 `AgentStepDraft` 物化成稳定的 `AgentStep`

## 和 host output 的关系

- `AgentStep`
  - 回答“这一次 step 实际发生了什么”
  - 持有 step 结束后稳定下来的 runtime 事实
  - 可以进入 transcript，供后续请求继续构造上下文
- `HostStepOutput`
  - 回答“外部宿主应该从这次 step 看到什么”
  - 是从 `AgentStep` 派生出来的 host-facing 输出
  - 不能反过来作为 loop state 或 transcript source of truth

关键约束：

- 不是每个 `AgentStep` 都必须生成 `HostStepOutput`
- hidden intermediate step 可以只进入 transcript，不对 chat / renderer 暴露普通消息
- `HostStepOutput` 的可见性和形态由 `host/output/` 下的 policy 和 builder 决定

## 和 transcript 的关系

- `AgentStep`
  - 是单次模型请求完成后得到的稳定结果
  - 它是 runtime-native 的 step payload
- `AgentTranscriptRecord`
  - 是 `AgentTranscript` 里的记录单元
  - 当记录类型是 `assistant_step` 时，payload 应该承载一个 `AgentStep`
- `AgentStepMaterializer`
  - 负责 `AgentStepDraft -> AgentStep`
  - 是 stable step 事件和 transcript write-back 之前的显式收口节点
  - 只允许 `completed | failed | aborted` draft 进入 materialize
  - `streaming | awaiting_tools` draft 不能直接收口成稳定 step

一句话：

- `AgentStep` 是“发生了什么”
- `HostStepOutput` 是“外部看到了什么”
- `AgentTranscriptRecord` 是“把这次 step 作为一条 transcript record 放进去”
- `AgentStepMaterializer` 是“什么时候从 draft 收成稳定 step”

补充约束：

- `AgentStepMaterializer` 不应接受任意 draft status
- 只有 `completed | failed | aborted` draft 才能进入 stable 收口
- `failed` draft 必须显式带 `failure`
- `aborted` draft 必须显式带 `abortReason`
- `streaming | awaiting_tools` draft 不应直接 materialize 成 `AgentStep`
- `awaiting_tools` 只是 loop 内部短暂过渡态
- 它表示当前 step 已经拿到可执行 tool calls，正在进入 tool batch 收集 / dispatch 前的收口阶段
- 如果当前 step 需要进入 stable event / transcript write-back 链，loop 必须先把 `awaiting_tools` 推进成 `completed`

## draft delta 约束

- `AgentStepDraftDelta` 必须是判别清晰的 runtime fact
- 不允许继续使用一个带多个可选字段的松散 delta bag
- 至少要区分：
  - `content_delta`
  - `reasoning_delta`
  - `tool_call_started`
  - `tool_call_ready`
  - `finish_reason`
  - `usage_delta`
  - `response_metadata`
- `tool_call_started`
  - 表示某条 tool call 的名字已明确出现
  - 可以作为宿主开始渲染 tool call 组件的稳定节点
- `tool_call_ready`
  - 表示某条 tool call 已完整成形
  - 可以作为 loop / executor 判断“现在可以开始执行工具”的稳定节点
- 顺序规则：
  - `tool_call_ready` 是唯一的执行触发节点
  - `tool_call_started` 只是可选的预渲染节点
  - 如果名字先出现、参数后补齐，可以先发 `tool_call_started`，后发 `tool_call_ready`
  - 如果名字和完整参数在同一个 chunk 才一起拿到，可以只发 `tool_call_ready`
  - 如果两者同一个 chunk 同时产出，消费方应按 started -> ready 的顺序理解
- 不再使用 `argumentsDelta`
  - arguments 的拼接属于 parser state / tool call assembly 过程
  - 对外的 runtime fact 只保留开始节点和 ready 节点
- `response_metadata` 的真源应在 delta 和 snapshot
  - 不应再在 draft 顶层额外缓存同名字段

这样 `ModelResponseParser -> AgentStepDraft` 的事实链才不会再次把合并逻辑塞回 loop。
