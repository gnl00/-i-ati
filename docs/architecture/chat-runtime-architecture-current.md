# Chat Runtime Architecture Current

## 当前目标

当前主线已经从 `chatRun` 中心，演进成四层结构：

- `agent`
  - 运行时 contracts 与工具执行归属
- `next`
  - 通用 runtime 内核
  - 承载 loop、step、model parsing、tools orchestration
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

- runtime contracts + core runtime
- host adapter
- post-run side jobs
- application operations

## 当前目录

```text
src/main/services/
  agent/
    contracts/
    tools/

  next/
    loop/
    step/
    events/
    tools/
    transcript/
    runtime/

  hostAdapters/
    chat/
      config/
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

现网主路径已经切到 `agent/*`、`next/*`、`chatRun/runtime/next/*`。

## hostAdapters/chat

`hostAdapters/chat` 是 chat 领域适配层。

当前已经落进去的内容：

- [ChatAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/ChatAgentAdapter.ts)
  - chat run 的总适配入口
  - 负责 `prepareRun / createStepRuntimeContext / finalizeRun`
- [config/](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/config)
  - `AppConfigStore`
  - `ChatModelContextResolver`
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
- 旧的 chat-side step wiring 已从当前主代码中移除
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
  - 通过当前主 runtime 执行 run
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
        -> legacy chat-side step wiring
        -> AgentRunKernel
        -> RunTerminalHandler
        -> ChatAgentAdapter.finalizeRun()
        -> PostRunJobService
```

step 执行链路：

旧的 assistant projection / step wiring 目前只作为历史设计存在，不再保留生产代码入口。

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

- `agent`
  - runtime contracts
  - tool execution
- `next`
  - step execution
  - parser / model response parsing
  - loop
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
- core execution、parser、tools 已落到 `next/*` / `agent/*`
- chat host adapter 已经成型
- `chatRun` 已明显退化为 shell 层

## 后续建议

- 评估 `ChatAgentAdapter` 是否进一步拆成更薄的 `prepare / step-context / finalize` facade
- 进一步扩展 runtime contracts，让 core 依赖更稳定地面向 contract 而不是 concrete 实现
- 等 shell/runtime 边界进一步稳定后，再决定 `chatRun/runtime` 中是否还有内容可继续下沉到 `next/*`
