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
    mapping/
    run/
    tools/
    types/
    index.ts

  hostAdapters/
    chat/
      mapping/
      persistence/
      preparation/
      finalize/
      ChatAgentAdapter.ts
      index.ts

  chatRun/
    runtime/
      assistant-step/
    preparation/
      request/
    finalize/
    config/
    index.ts
    event-emitter.ts
    tool-confirmation.ts
    errors.ts
    logger.ts
    types.ts

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
- [tools/ToolExecutor.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/tools/ToolExecutor.ts)
  - 并发工具执行
  - runtime context 注入
  - confirmation / progress / abort

当前 `agentCore` 还没有完全独立：

- parser 仍暂存在 `chatRun/streaming/parser`
- run manager / run instance 仍暂存在 `chatRun/runtime`
- errors / logger / tool confirmation 仍在 `chatRun`

所以现在已经有了真实 core，但还没有完全去 chatRun 化。

## hostAdapters/chat

`hostAdapters/chat` 是 chat 领域适配层。

当前已经落进去的内容：

- [ChatAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/ChatAgentAdapter.ts)
  - chat run 的总适配入口
  - 负责 `prepareRun / finalizeRun`
- [mapping/ChatEventMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/mapping/ChatEventMapper.ts)
  - chat-facing event mapping
- [persistence/ChatSessionStore.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/persistence/ChatSessionStore.ts)
  - chat load/create/history load
  - chat finalize/title update
- [persistence/ChatStepStore.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/persistence/ChatStepStore.ts)
  - user message / assistant placeholder / tool result / finalize assistant
- [preparation/index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/preparation/index.ts)
  - 当前先作为 chat preparation 边界入口
- [finalize/index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/finalize/index.ts)
  - 当前先作为 chat finalize 边界入口

当前 `hostAdapters/chat` 的状态是：

- mapping / persistence 已经物理迁入
- preparation / finalize 已经建立 host-side 入口
- 底层实现当前仍暂时复用 `chatRun/preparation` 与 `chatRun/finalize`

也就是说，边界已经立起来了，但底层实现还没有全部搬完。

## chatRun

`chatRun` 现在更接近 runtime shell，而不是 chat-specific 总入口。

### 当前职责

- [index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/index.ts)
  - facade
  - 对外暴露 `start / runBlocking / cancel / resolveToolConfirmation`
- [runtime/RunManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/RunManager.ts)
  - active run registry
  - `accepted / runBlocking / cancel`
- [runtime/AgentRun.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/AgentRun.ts)
  - 单次 run 生命周期协调器
  - 当前通过 `ChatAgentAdapter` 获取 chat-specific prepare/finalize 能力
- [execution/AssistantStepFactory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/AssistantStepFactory.ts)
  - 负责把 chat-side message manager、event mapper 装配到 `agentCore/execution`
- [execution/AssistantStepMessageManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/AssistantStepMessageManager.ts)
  - 当前 step 中的 message state
  - 已开始产出 `StepArtifact`
- [execution/AssistantStepEventMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/AssistantStepEventMapper.ts)
  - step 运行期事件映射到 chat run events

### 仍留在 chatRun 的 chat-specific 内容

- [preparation/](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/preparation)
  - 底层实现仍在这里
- [finalize/RunFinalizeService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/finalize/RunFinalizeService.ts)
  - 底层实现仍在这里
- [config/](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/config)
  - `AppConfigStore`
  - `ChatModelContextResolver`

所以 `chatRun` 当前是“正在去 chat adapter 化”的中间态。

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
  -> RunManager
    -> AgentRun
      -> ChatAgentAdapter.prepareRun()
        -> ChatPreparationPipeline
      -> AgentStepLoop
      -> ChatAgentAdapter.finalizeRun()
        -> ChatFinalizeService
      -> PostRunJobService
```

step 执行链路：

```text
AssistantStepFactory
  -> AgentStepLoop
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
  - 开始承载稳定的 core types / execution / tools
- `hostAdapters/chat`
  - 开始承载稳定的 chat mapping / persistence / adapter
- `chatPostRun`
  - 明确是异步 side jobs
- `chatOperations`
  - 明确是显式 use case

当前仍然没有完全收干净的部分：

- `chatRun/preparation`
- `chatRun/finalize`
- `chatRun/config`
- `chatRun/streaming/parser`
- `chatRun/errors` / `logger` / `tool-confirmation`

所以目前的状态是：

- 新架构骨架已经落地
- core execution 与 tools 已进 `agentCore`
- chat host adapter 已经成型
- 但仍有一部分实现暂时挂在 `chatRun` 下

## 后续建议

- 继续把 `chatRun/preparation` 物理迁到 `hostAdapters/chat/preparation`
- 继续把 `chatRun/finalize` 物理迁到 `hostAdapters/chat/finalize`
- 继续评估 `chatRun/config` 是否也应迁到 `hostAdapters/chat`
- 等 run runtime 边界进一步稳定后，再决定是否把 `chatRun/runtime` 中的更多内容下沉到 `agentCore/run-kernel`
