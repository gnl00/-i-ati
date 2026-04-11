# loop

这一层只放 agent loop 自身的核心运行时对象。

这里不应该出现：

- `MessageEntity`
- `ChatRunEventEmitter`
- renderer IPC
- database persistence
- host-specific adapter

## 这一层负责什么

- 维护当前 run 的 step 状态
- 根据 transcript 构造下一次模型请求
- 消费 parser 结果
- 组织 ready tool calls 的收集、materialize、tool batch 组装和执行
- 将 tool result 重新接回模型上下文
- 输出 step 级结果
- 在合适的节点发出 in-flight / stable / terminal 事件

## 这一层不负责什么

- 不决定哪些内容要对外输出
- 不决定消息如何落库
- 不直接发 chat event
- 不处理 renderer / telegram / host outputs

## 文件说明

- `AgentLoopInput.ts`
  - 启动一次 loop 所需的最小输入 contract
- `LoopRunDescriptor.ts`
  - 单次 loop / run 的稳定标识信息
- `LoopExecutionConfig.ts`
  - loop 运行期间共享的稳定执行配置
- `LoopIdentityProvider.ts`
  - loop 内部稳定标识的分配接口
- `RuntimeClock.ts`
  - loop 运行过程中使用的稳定时间来源
- `AgentLoopDependencies.ts`
  - `AgentLoop` 真正消费的最小依赖面
- `AgentLoop.ts`
  - `next` 的唯一核心 orchestrator
- `AgentLoopResult.ts`
  - 整个 loop 的最终输出

## 输入输出边界

- `AgentLoopInput`
  - 定义一次 loop 启动时必须提供的最小输入
  - 应包含 run 标识、起始 transcript、`AgentRequestSpec`、执行配置和必要上下文引用
  - 不承载运行中的可变状态
- `AgentLoopDependencies`
  - 定义 loop 执行时真正消费的 bridges / emitter / id&time providers
  - 不重复包含 runtime sources 或 host bootstrap
- `LoopRunDescriptor`
  - 定义单次 loop / run 的稳定标识信息
  - 当前至少应包含 `runId`
  - 不承载 transcript、request spec 或执行配置
- `LoopExecutionConfig`
  - 定义 loop 运行期间共享的稳定执行配置
  - 例如 `maxSteps`
  - 不承载启动事实，也不承载取消信号
- `AgentLoopResult`
  - 定义一次 loop 完成后的稳定终态
  - 应包含最终 step、完整 `AgentTranscriptSnapshot`、usage 汇总、终态
  - 不直接退化成 host output 或 renderer payload

关键约束：

- `AgentLoop` 的入参应该是 runtime-native input，而不是 chat-specific 对象集合
- `AgentLoop` 的依赖面应收敛为显式的 `AgentLoopDependencies`
- `AgentStepDraft -> AgentStep` 的 stable 收口应通过显式 `AgentStepMaterializer` 完成
- 请求维度应通过 `AgentRequestSpec` 显式传入，而不是散落成额外 request bag
- 启动事实应先进入 `AgentTranscript`，不再保留 transcript 外的 bootstrap user input
- `runId` 等本次 run 的标识信息应通过 `LoopRunDescriptor` 表达，而不是混在启动事实里
- 稳定执行配置应通过 `LoopExecutionConfig` 显式表达，而不是和启动事实平铺混在一起
- 外部取消应继续通过 `AbortSignal` 表达，不并入稳定执行配置
- `stepId` / `recordId` / `batchId` 的来源应通过显式的 `LoopIdentityProvider` 表达
- `timestamp` / `createdAt` 之类的时间来源应通过显式的 `RuntimeClock` 表达
- 一个 `AgentStep` 恰好对应一次模型请求
- tool 结果回传后如果继续推理，应开始新的 `AgentStep`
- 只有 `tool_call_ready` 才能进入 tool batch 组装
- `tool_call_ready` 进入 tools 边界后，应先被提炼成 `ToolCallReadyFact`
- `ToolCallReadyFact -> ReadyToolCall` 的转换应通过显式 materializer 完成
- `ToolBatch -> ToolDispatchOutcome` 应通过 `ToolExecutorDispatcher` 完成
- `completed` outcome 应进入 transcript write-back
- `failed` / `aborted` outcome 只有在显式携带 `partialResults` 时才允许先写回 transcript
- `failed` / `aborted` outcome 应由 loop 显式决定是否进入 terminal
- `AgentLoopResult` 回答的是“整轮 run 最后怎样了”，不是“外部该显示什么”
- host-visible 内容应该继续通过 `events/` 和 `host/output/` 获得
- `AgentTranscript -> AgentTranscriptSnapshot` 的终态收口应通过显式 materializer 完成

## 和 events 的关系

- `loop` 负责产生事件
- `events` 负责定义事件 contract

具体约束：

- step streaming 过程中，loop 只能发 in-flight 事件
- step materialize 成 `AgentStep` 后，loop 才能发 stable step 事件
- step materialize 不应由 loop 临时手写字段拷贝完成
- 整个 run 结束后，loop 才能发 terminal 事件并生成 `AgentLoopResult`

## 和 transcript 的关系

- `AgentLoop`
  - 读取 `AgentTranscript`
  - 驱动 step、tools 和模型续推理
- `AgentLoopResult`
  - 应包含 loop 结束时稳定下来的完整 `AgentTranscriptSnapshot`

关键约束：

- loop 可以推进 transcript，但不把 transcript 和 host output 混成一个结果对象
- 启动时第一条 user record 也应由 transcript 持有
- `AgentLoopResult` 可以暴露完整 `AgentTranscriptSnapshot`，但不负责把它转成模型请求或用户消息
- `AgentTranscriptSnapshot` 的生成不应由 loop 临时手写拷贝逻辑完成

## 和 runtime 的关系

- `NextAgentRuntime`
  - resolve per-run sources
  - 完成 bootstrap
  - 组装 `AgentLoopDependencies`
- `AgentLoop`
  - 只消费 `AgentLoopInput + AgentLoopDependencies`
  - 不自己反向依赖 runtime context

关键约束：

- runtime sources 不应直接下沉到 loop 依赖面
- `AgentLoopDependencies` 只保留 loop 真正直接调用的 bridges / emitter / id&time providers
- runtime 负责 wiring，loop 负责执行
