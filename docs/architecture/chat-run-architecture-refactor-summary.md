# Chat Run Architecture Refactor Summary

> 这份文档记录的是 `chatRun` 重构阶段的阶段性总结，部分目录与文件路径属于当时状态。
> 当前结构请优先参考 [chat-runtime-architecture-current.md](/Users/gnl/Workspace/code/-i-ati/docs/architecture/chat-runtime-architecture-current.md)。

## 背景

这次优化不是一次局部修补，而是一次应用结构级别的重构。

重构前，chat 提交流程存在几个长期问题：

- renderer 和 main 同时参与提交流程编排，职责分裂。
- `chat submit` 是长生命周期 IPC，同时又依赖 event stream 回传状态，接口语义不清晰。
- assistant delta、tool call、submission lifecycle 在 renderer 中被二次解释和重建。
- title generation、compression 等后处理容易混入主链路，拖慢 `run.completed`。
- 同一轮对话状态散落在 request、session、store、DB 多个层次，时序问题和状态漂移风险较高。

本次重构的目标是把 chat 执行收敛成一条明确主线：

1. submit a run
2. run the agent loop in main

renderer 不再承担流程编排，只负责提交命令和投影事件。

## 重构原则

- main 是 chat execution 的唯一 runtime truth。
- renderer 只消费 `RUN_EVENT`，不重建 assistant/tool 状态机。
- `run.completed` 是主链路完成边界。
- title generation 和 compression 是 post-run jobs，不阻塞主流程。
- 命名必须反映真实职责边界，不保留误导性的 legacy 语义。

## 核心变化

### 1. 提交流程从 `chatSubmit` 收敛为 `chatRun`

主流程命名整体从 `chatSubmit` 迁移到 `chatRun`：

- IPC 常量从 `CHAT_SUBMIT_*` 统一为 `RUN_*`
- 共享事件协议迁移到 `src/shared/run/events.ts`
- main runtime 迁移到 `src/main/orchestration/chat/run/`
- renderer 只保留新的 run 提交和事件投影入口

这一步的意义不是 rename 本身，而是把概念从“提交一次请求”升级为“启动一个 run”。

### 2. main 成为唯一编排层

renderer 侧旧的 event-driven submit 架构已从主路径移除。

现在的职责是：

- main：
  - chat/history/message prepare
  - assistant step loop
  - tool execution
  - finalize
  - post-run jobs
  - event emit / trace persistence
- renderer：
  - submit run
  - cancel / tool confirm
  - subscribe run events
  - update store / UI

### 3. IPC 语义改为 accepted-first

`RUN_START` 现在是 accepted 语义：

- 提交后立即返回 `{ accepted: true, submissionId }`
- 真正执行在 main 后台继续
- renderer 不再等待长 IPC 完成，而是依赖事件流观察 run 生命周期

### 4. post-run jobs 从主完成链路拆出

title generation 和 compression 已独立为 post-run jobs：

- `run.completed` 先发出
- renderer 立即恢复输入状态
- title/compression 在后台继续异步执行
- 后续通过 `title.generation.*` / `compression.*` 事件更新

### 5. runtime 进一步拆分成明确层次

在 `chatRun` 内部，原先的大类已经逐步拆开：

- `RunManager`
  - 管理 active runs
  - 负责 `start / runBlocking / cancel`
- `AgentRun`
  - 表示单次 run 实例
  - 负责完整 run 生命周期
- `RunPreparationService`
  - 准备 chat、messages、request、prompts、tools
- `AssistantStepLoop`
  - 单次 assistant 回合循环执行器
  - 驱动 `request -> response -> tool -> next request`
- `ChatStepCommitter`
  - 管理 legacy assistant/tool message 更新与投影落点
- `RunFinalizeService`
  - assistant 最终消息与 chat 最终状态落库
- `PostRunJobService`
  - title generation / compression

## 命名与目录重构

### 为什么去掉 `StreamingOrchestrator`

`StreamingOrchestrator` 这个名字在新架构下不再准确：

- 它不只处理 streaming，也支持 non-streaming
- 它不是 run 级 orchestrator，真正的 run 级编排者已经是 `AgentRun`
- 它的真实边界是“一次 assistant step 内部的 loop”

因此本次统一改名为：

- `StreamingOrchestrator` -> `AssistantStepLoop`
- `StreamingOrchestratorContext` -> `AssistantStepContext`
- `StreamingOrchestratorDeps` -> `AssistantStepDeps`
- `StreamingOrchestratorConfig` -> `AssistantStepLoopConfig`
- `StreamingMessageManager` -> `ChatStepCommitter` / `AssistantStepAssembler`

### 为什么用 `AssistantXXX` 而不是 `AgentXXX`

当前层次里：

- `AgentRun` 代表完整 run 生命周期
- `AssistantStepLoop` 只处理单次 assistant step

所以这里使用 `AssistantXXX` 更能表达边界，避免和上层 `AgentRun` 语义冲突。

### 当前目录结构

当前主结构如下：

```text
src/main/orchestration/chat/run/
  index.ts
  event-emitter.ts
  tool-confirmation.ts
  errors.ts
  types.ts
  preparation/
    RunEnvironmentService.ts
    StepBootstrapService.ts
    RunRequestFactory.ts
    index.ts
  runtime/
    RunManager.ts
    AgentRun.ts
    assistant-step/
      AssistantStepLoop.ts
      ChatStepCommitter.ts
  finalize/
    RunFinalizeService.ts
src/main/orchestration/chat/postRun/
  TitleJobService.ts
  CompressionJobService.ts
  PostRunJobService.ts
  post-run/
    PostRunJobService.ts
  streaming/
    parser/
    executor/
    segment-utils.ts
```

这表示：

- `runtime/` 关注 run 和 turn 执行
- `assistant-step/` 关注单次 assistant step
- `streaming/` 只保留更底层的 parser / executor 能力

## 当前主流程

当前 run 主链路可以概括为：

```text
RunService
  -> RunManager
    -> AgentRun
      -> RunPreparationService
      -> AssistantStepLoop
      -> RunFinalizeService
      -> PostRunJobService
```

事件流边界如下：

```text
run.accepted
  -> run.state.changed(preparing)
  -> chat.ready
  -> messages.loaded
  -> message.created(user)
  -> message.created(assistant placeholder)
  -> run.state.changed(streaming / executing_tools / finalizing)
  -> message.updated
  -> tool.call.detected
  -> tool.execution.started / completed / failed
  -> tool.result.attached
  -> chat.updated
  -> run.completed | run.failed | run.aborted
  -> title.generation.* / compression.*
```

## 测试覆盖增强

这次重构不仅调整了代码结构，也同步把测试覆盖对齐到新分层：

- `RunService.test.ts`
  - 保留 facade 级入口验证
- `RunManager.test.ts`
  - 覆盖 active run、accepted、duplicate submission、cancel 语义
- `AgentRun.test.ts`
  - 覆盖单次 run 成功路径和 abort 路径
- scheduler 相关测试继续验证 `runBlocking` 语义

这样后续继续拆分依赖时，不需要再完全依赖 `RunService` 间接覆盖。

## 当前收益

这轮重构带来的直接收益包括：

- chat run 的唯一真相回到 main。
- renderer 退出流程编排层，复杂度显著降低。
- `run.completed` 边界明确，不再被 title/compression 阻塞。
- runtime 层次清晰，后续可以在 `RunManager / AgentRun / AssistantStepLoop` 继续演进。
- 命名和目录结构已经基本和真实职责一致，不再依赖历史语义。

## 后续建议

当前结构已经稳定，但还有进一步演进空间：

- 继续把 `streaming/parser`、`streaming/executor` 的命名边界再细化，明确哪些属于 assistant step，哪些属于更底层 runtime 能力。
- 如果后续需要更强的可替换性，可以继续把 parser、tool executor、event emitter factory 等运行时依赖进一步工厂化或注入化。
- 若要做更完整的 run introspection，可以围绕 `RunManager` 增加 run 查询、运行状态快照和调试视图。

## 相关文件

- `src/main/orchestration/chat/run/index.ts`
- `src/main/orchestration/chat/run/runtime/RunManager.ts`
- `src/main/orchestration/chat/run/runtime/AgentRun.ts`
- `ChatStepCommitter` 已从当前主代码移除
- `src/main/hosts/chat/preparation/index.ts`
- `src/main/hosts/chat/finalize/ChatFinalizeService.ts`
- `src/main/orchestration/chat/postRun/PostRunJobService.ts`
- `src/shared/run/events.ts`
- `src/renderer/src/hooks/chatRun/useChatRun.ts`
