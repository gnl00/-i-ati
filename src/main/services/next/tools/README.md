# tools

这一层只关心 tool call 自身，不关心 chat transcript。

## 这一层负责什么

- 描述一个 step 里解析出的 tool batch
- 定义 tool confirmation policy
- 执行 tool batch
- 定义 tool 执行进度
- 把 tool result 组织成可回传模型的结果

核心主路径：

- 模型发出 tool call
- 系统执行 tool
- 系统把 tool result 回传模型
- 模型基于 tool result 决定下一步输出或下一次工具调用

更具体地说：

- tool execution progress
  - 属于运行过程事实
  - 应该通过 `events/` 广播给外层
- tool awaiting confirmation
  - 属于运行过程事实
  - 应该通过 `events/` 广播给外层
  - dispatcher 应显式暴露外部确认注入点，而不是把 required tool 默认短路成 denied
- tool execution result
  - 属于协议续上下文事实
  - 应该在 loop 中被整理后写入 `transcript/`

## 这一层不负责什么

- 不决定外部输出
- 不决定 UI 是否显示中间文本
- 不直接读写 runtime transcript
- 不决定哪些 tool 进度事件需要被宿主展示

## 文件说明

- `ToolBatch.ts`
  - 同一 step 内待执行的 tool 集合
- `ReadyToolCall.ts`
  - 已经完整可执行、可以进入 batch 组装的 tool call contract
- `ToolCallReadyFact.ts`
  - 从 step facts 中提炼出来、供 tools 层消费的 ready tool call 事实
- `ReadyToolCallMaterializer.ts`
  - 把 `ToolCallReadyFact` 物化成 `ReadyToolCall`
- `ToolBatchAssembler.ts`
  - 把 step 中已经 ready 的 tool calls 组装成 `ToolBatch`
- `ToolDispatchOutcome.ts`
  - 描述 dispatcher 执行完一个 `ToolBatch` 之后的稳定结果
- `ToolConfirmationPolicy.ts`
  - tool 执行前确认策略
- `ToolExecutorDispatcher.ts`
  - 面向 loop 的工具执行分发接口

## 和 events / transcript 的关系

- `tools/`
  - 定义 batch 和执行分发
- `events/`
  - 承载 tool 执行中的进度事实
- `transcript/`
  - 承载 tool 执行完成后、需要回传模型的结果事实

关键约束：

- `tool.execution_progress` 之类的过程事件不进入 transcript
- `tool.awaiting_confirmation` 这类等待态事件不进入 transcript
- confirmation denied 应被规范化成稳定的 denied/aborted tool result，再由 loop 回传模型
- required confirmation 的默认 runnable 行为应是：
  - 先发 `tool.awaiting_confirmation`
  - 等待外部确认回调结果
  - 只有在外部明确拒绝，或 runtime 未提供确认结果时，才规范化成 denied result
- 只有会影响下一次模型请求的 tool result 才进入 transcript
- `tools/` 不自己写 transcript，由 `loop/` 负责把结果接回协议历史
- dispatcher 返回 `completed` 时，loop 才能把 `ToolResultFact[]` 写回 transcript
- dispatcher 返回 `failed` / `aborted` 时，loop 应优先进入 terminal path
  - 除非 outcome 显式带了 `partialResults`
- `ToolBatch` 应只由已经 ready 的 tool calls 组装出来
- `tool_call_ready` 是进入 batch 组装的唯一稳定节点
- `tool_call_started` 不能触发 batch 组装或工具执行
- tools 层不应直接依赖 `step/` 下的 delta 命名
  - `tool_call_ready` 进入 tools 边界后，应先被提炼成 `ToolCallReadyFact`
- `ReadyToolCallMaterializer`
  - 负责把 `ToolCallReadyFact` 转成 `ReadyToolCall`
  - loop 不应在多个位置重复手写这段转换
- `ToolBatchAssembler` 不直接接 `IToolCall[]`
  - 它只接受 `ReadyToolCall[]`
  - 这样“只有 ready call 才能进 batch”会变成类型约束，而不只是文案约束
  - batch 所属的 `stepId` 由 assembler 顶层输入提供，不在每条 `ReadyToolCall` 上重复携带
- `ToolExecutorDispatcher`
  - 负责 `ToolBatch -> ToolDispatchOutcome`
  - 不直接写 transcript
  - 不直接决定 loop 是否 completed / failed / aborted

## 关键策略边界

- `ToolConfirmationPolicy`
  - 定义执行前是否需要确认
  - 不定义确认 UI 长什么样
  - 需要把 awaiting / denied 的运行规则定义清楚

这里不再单独定义 continuation / stop policy。

对 client-side tools，标准 contract 就是：

- tool result 回传模型
- 模型决定接下来是继续调用工具，还是直接给出最终回答
