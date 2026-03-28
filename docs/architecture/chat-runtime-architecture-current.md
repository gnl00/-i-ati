# Chat Runtime Architecture Current

## 当前目标

当前主线已经从 `chatRun` 中心，演进成四层结构：

- `agentCore`
  - 通用 runtime 内核
  - 承载 core types、step execution、tool execution
- `hostAdapters/chat`
  - chat host adapter
  - 承载 chat-specific mapping、persistence、prepare/finalize 边界
- `chatPostRun`
  - run 完成后的后台 job
  - title / compression
- `chatOperations`
  - 显式 chat 操作入口
  - 手动压缩、手动生成标题

这四层分别对应：

- core runtime
- host adapter
- post-run side jobs
- application operations

## 当前目录

```text
src/main/services/
  agentCore/
    contracts/
    execution/
      parser/
    run-kernel/
    tools/
    types/
    index.ts

  hostAdapters/
    chat/
      config/
      execution/
      mapping/
      persistence/
      preparation/
      finalize/
      ChatAgentAdapter.ts
      index.ts

  chatRun/
    infrastructure/
    runtime/
    index.ts

  chatPostRun/
    PostRunJobService.ts
    TitleJobService.ts
    CompressionJobService.ts
    index.ts
    types.ts
    utils.ts

  chatOperations/
    CompressionExecutionService.ts
    TitleGenerationService.ts
    index.ts
    types.ts
    utils.ts
```

## agentCore

`agentCore` 是未来的运行时内核。

当前已经真正落进去的内容：

- [types/index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/types/index.ts)
  - `RunSpec`
  - `StepArtifact`
  - `StepResult`
  - `RunResult`
  - `ToolCall`
  - `ToolCallProps`
- [execution/AgentStepLoop.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/execution/AgentStepLoop.ts)
  - 单次 step loop
  - `request -> response -> tool -> next cycle`
- [execution/AgentStepRuntimeFactory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/execution/AgentStepRuntimeFactory.ts)
  - 组装 `AgentStepLoop` 所需的 runtime pieces
- [execution/parser/](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/execution/parser)
  - chunk parser
  - tool call parser
  - think tag parser
  - segment content helpers
- [tools/ToolExecutor.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/tools/ToolExecutor.ts)
  - 并发工具执行
  - runtime context 注入
  - confirmation / progress / abort
- [run-kernel/AgentRunKernel.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/run-kernel/AgentRunKernel.ts)
  - run 级 kernel
  - 负责 step 执行结果与终态收敛

当前 `agentCore` 还没有完全独立：

- run manager / run instance 仍暂存在 `chatRun/runtime`
- shell 级 errors / logger / tool confirmation 仍在 `chatRun`

所以现在已经有了真实 core，但还没有完全去 chatRun 化。

## hostAdapters/chat

`hostAdapters/chat` 是 chat 领域适配层。

当前已经落进去的内容：

- [ChatAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/ChatAgentAdapter.ts)
  - chat run 的总适配入口
  - 负责 `prepareRun / createStepRuntimeContext / finalizeRun`
- [config/](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/config)
  - `AppConfigStore`
  - `ChatModelContextResolver`
- [execution/](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution)
  - `AssistantStepFactory`
  - `AssistantStepMessageManager`
  - `AssistantStepEventMapper`
- [mapping/ChatEventMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/mapping/ChatEventMapper.ts)
  - chat-facing event mapping
- [mapping/ChatStepRuntimeContextMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/mapping/ChatStepRuntimeContextMapper.ts)
  - 将 chat 上下文收窄成 step runtime 所需最小上下文
- [persistence/ChatSessionStore.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/persistence/ChatSessionStore.ts)
  - chat load/create/history load
  - chat finalize/title update
- [persistence/ChatStepStore.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/persistence/ChatStepStore.ts)
  - user message / assistant placeholder / tool result / finalize assistant
- [preparation/index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/preparation/index.ts)
  - chat preparation pipeline
- [finalize/index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/finalize/index.ts)
  - chat finalize boundary

当前 `hostAdapters/chat` 的状态是：

- config / mapping / persistence / preparation / finalize 已全部物理迁入
- step 运行期的 chat-side wiring 也已迁入 `hostAdapters/chat/execution`
- 当前已经是一个真实的 chat host adapter，而不只是目录边界

也就是说，chat-specific 的主体实现已经基本收进 `hostAdapters/chat`。

## chatRun

`chatRun` 现在更接近 runtime shell，而不是 chat-specific 总入口。

### 当前职责

- [index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/index.ts)
  - facade
  - 对外暴露 `start / runBlocking / cancel / resolveToolConfirmation`
- [runtime/RunManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/RunManager.ts)
  - shell runtime manager
  - `accepted / runBlocking / cancel`
- [runtime/AgentRun.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/AgentRun.ts)
  - shell 层 run 生命周期协调器
  - 通过 `ChatAgentAdapter` 获取 chat-specific prepare/finalize 能力
  - 通过 `AgentRunKernel` 执行 run kernel
- [runtime/RunLifecycleEventMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/RunLifecycleEventMapper.ts)
  - run 生命周期事件发射
- [runtime/RunTerminalHandler.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/RunTerminalHandler.ts)
  - kernel 终态到 shell `RunResult` 的收敛
- [runtime/RunRegistry.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/RunRegistry.ts)
  - active run registry
- [runtime/ChatRunRuntimeFactory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/ChatRunRuntimeFactory.ts)
  - shell composition root
- [infrastructure/event-emitter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/infrastructure/event-emitter.ts)
  - chat run event emitter factory
- [infrastructure/tool-confirmation.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/infrastructure/tool-confirmation.ts)
  - tool confirmation manager

### 仍留在 chatRun 的非 core 内容

- shell runtime orchestration
- emitter / confirmation infrastructure

所以 `chatRun` 当前更像 shell 层，而不是 chat adapter 本体。

## chatPostRun

`chatPostRun` 只负责 run 结束后的后台 job：

- [PostRunJobService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatPostRun/PostRunJobService.ts)
- [TitleJobService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatPostRun/TitleJobService.ts)
- [CompressionJobService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatPostRun/CompressionJobService.ts)

关键点保持不变：

- `run.completed` 先发
- title/compression 异步继续执行
- 不阻塞主 run 完成边界

## chatOperations

`chatOperations` 是显式 operation 层：

- [CompressionExecutionService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatOperations/CompressionExecutionService.ts)
- [TitleGenerationService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatOperations/TitleGenerationService.ts)

它和 `chatPostRun` 的区别仍然是：

- `chatOperations`
  - 用户或 IPC 主动触发
- `chatPostRun`
  - run 结束后后台触发

## 当前主流程

当前主链路已经变成：

```text
ChatRunService
  -> ChatRunRuntimeFactory
    -> RunManager
      -> AgentRun
        -> RunLifecycleEventMapper
        -> ChatAgentAdapter.prepareRun()
        -> AssistantStepFactory
        -> AgentRunKernel
        -> RunTerminalHandler
        -> ChatAgentAdapter.finalizeRun()
        -> PostRunJobService
```

step 执行链路：

```text
hostAdapters/chat/execution/AssistantStepFactory
  -> agentCore/execution/AgentStepRuntimeFactory
    -> AgentStepLoop
    -> parser/*
    -> ToolExecutor
    -> AssistantStepMessageManager
    -> AssistantStepEventMapper
```

显式 operation 链路：

```text
IPC
  -> ChatRunService
    -> chatOperations/*
```

post-run 链路：

```text
AgentRun completed
  -> PostRunJobService
    -> TitleJobService
    -> CompressionJobService
```

## 当前边界判断

当前已经比较明确的部分：

- `agentCore`
  - 稳定 core types
  - step execution
  - parser
  - tool execution
  - run kernel
- `hostAdapters/chat`
  - chat config
  - chat preparation/finalize
  - chat persistence
  - chat event mapping
  - chat-side step wiring
- `chatPostRun`
  - 明确是异步 side jobs
- `chatOperations`
  - 明确是显式 use case
- `chatRun`
  - 明确是 shell/runtime orchestration

所以目前的状态是：

- 新架构骨架已经落地
- core execution、parser、tools、run-kernel 已进 `agentCore`
- chat host adapter 已经成型
- `chatRun` 已明显退化为 shell 层

## 后续建议

- 评估 `ChatAgentAdapter` 是否进一步拆成更薄的 `prepare / step-context / finalize` facade
- 进一步扩展 `agentCore/contracts`，让 core 依赖更稳定地面向 contract 而不是 concrete 实现
- 等 shell/runtime 边界进一步稳定后，再决定 `chatRun/runtime` 中是否还有内容可继续下沉到 `agentCore`
