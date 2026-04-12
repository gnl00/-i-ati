# events

这一层定义 `AgentLoop` 对外发出的 runtime 事实。

核心思想：

- loop 只发事实
- 外层自己决定怎么处理这些事实

## 这一层负责什么

- 定义 event type
- 定义 event payload
- 定义高层事件发射 contract
- 定义 event sink / bus contract
- 定义“过程事件”和“稳定结果事件”的边界

## 这一层不负责什么

- 不做 chat mapping
- 不做 renderer IPC
- 不做 database persistence
- 不把 event 当作 transcript 或 output 的替代品

## 事件分层

runtime 里的事件至少要分成三类：

- step in-flight events
  - 例如 `step.started`、`step.delta`
  - 依赖 `AgentStepDraft` 或 loop 过程中的临时事实
  - 用来驱动 streaming UI、debug tracer、tool activity 提示
- step stable events
  - 例如 `step.completed`、`step.failed`、`step.aborted`
  - 依赖已经 materialize 完成的 `AgentStep`
  - `AgentStepDraft -> AgentStep` 的收口应通过显式 `AgentStepMaterializer`
  - 表示一次模型请求已经形成稳定结果或稳定终态
- loop terminal events
  - 例如 `loop.completed`、`loop.failed`、`loop.aborted`
  - 依赖整个 run 的终态，而不是某个 step 的局部状态

关键约束：

- draft 级事件不能假装自己是稳定 step 结果
- 稳定 step 事件不能回退成 host-specific message
- loop 终态事件不能替代 step 级事件
- step 级失败或中断，仍然应优先使用 step stable event 表达，而不是跳过到 loop terminal event

## 和 step / loop 的关系

- `step/`
  - 定义 step 的 draft 和稳定结果
- `events/`
  - 定义 loop 对这些 step 状态变化广播什么事实
- `loop/`
  - 负责实际触发这些事件

也就是说：

- `AgentStepDraft` 是 in-flight state
- `AgentStep` 是 stable result
- `AgentEvent` 是它们变化时对外广播的事实

补充约束：

- `step.delta` 不应直接把整份 draft 当成 payload 透传
- 更合理的 contract 是：
  - 单条 typed `AgentStepDraftDelta`
  - 加一份当前派生 `snapshot`
- 这样事件层既能拿到增量事实，也不会把整个 draft 再次当成 source of truth
- 不再额外保留 `step.tool_calls_detected`
  - tool call 的 in-flight 事实统一通过 `step.delta` 里的 `tool_call_started` / `tool_call_ready` 表达
  - 当前累计结果如果需要暴露，应通过同一事件里的 `snapshot.toolCalls` 读取

## 文件说明

- `AgentEvent.ts`
  - runtime 事件统一入口类型
- `AgentEventEmitter.ts`
  - loop 使用的高层事件发射 contract
- `StepEvent.ts`
  - 单个 step 相关事件定义
- `ToolEvent.ts`
  - tool 执行阶段事件定义
- `LoopEvent.ts`
  - 整轮 loop 终态事件定义
- `AgentEventSink.ts`
  - 事件消费接口
- `AgentEventBus.ts`
  - 事件分发协调器

## 推荐组织方式

- `StepEvent`
  - 承载 step in-flight 和 step stable 事件
- `ToolEvent`
  - 承载 tool 执行过程和确认流程事件
- `LoopEvent`
  - 承载整轮 run 的 terminal 事件
- `AgentEvent`
  - 作为统一联合入口，供 bus 和 sink 使用
- `AgentEventEmitter`
  - 作为 loop 使用的高层发射入口
  - 负责把 runtime facts 组装成稳定 `AgentEvent`
- `AgentEventBus`
  - 作为更底层的广播协调器
  - 管理多个 sink，不直接暴露给 loop

这样做的目的不是把事件层做复杂，而是避免所有事件再次回堆到一个大文件里。

补充约束：

- `AgentLoop` 不应直接手写 `AgentEvent` union payload
- `AgentLoop` 应通过显式 `AgentEventEmitter` 发射事件
- `AgentEventBus` 可以继续存在，但它属于更底层的事件基础设施

## approval flow 约束

- `tool.awaiting_confirmation`
  - 只表示 loop 正在等待外部确认
  - 这是 event，不进入 transcript
  - 它应对应一个真实的外部确认注入点，而不是被默认立即拒绝
- `tool.confirmation_denied`
  - 表示确认被拒绝
  - 它携带的是 runtime-native `ToolResultFact`
  - 事件 identity 以 `deniedResult` 为准，不再在顶层重复展开
  - 如果模型需要看到这次拒绝，loop 应再把这条 fact materialize 成稳定的 denied/aborted tool result 写入 transcript
- `tool.execution_progress`
  - `started` 不携带 result
  - `completed` / `failed` / `aborted` 必须携带 result
  - terminal progress 的 identity 以 `result` 为准，不再在顶层重复展开
