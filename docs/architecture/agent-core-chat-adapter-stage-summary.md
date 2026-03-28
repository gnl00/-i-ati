# Agent Core / Chat Adapter Stage Summary

> 这份文档记录的是 `agentCore + hostAdapters/chat` 拆分过程中的阶段性总结，部分路径描述对应当时状态。
> 当前结构请优先参考 [chat-runtime-architecture-current.md](/Users/gnl/Workspace/code/-i-ati/docs/architecture/chat-runtime-architecture-current.md)。

## 背景

这一阶段的目标，不再是单纯把 `chatSubmit` 改名为 `chatRun`，而是继续把运行时拆成更清晰的三层：

- `agentCore`
  - 通用执行内核
- `hostAdapters/chat`
  - chat 领域适配层
- `chatRun`
  - shell / runtime orchestration

重点不是继续拆 service 数量，而是把“哪些属于 core、哪些属于 chat adapter、哪些属于 shell”逐步做实。

## 这一阶段完成的关键调整

### 1. 明确 shell / infrastructure 边界

`ChatRunEventEmitterFactory` 和 `ToolConfirmationManager` 已迁到：

- [event-emitter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/infrastructure/event-emitter.ts)
- [tool-confirmation.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/infrastructure/tool-confirmation.ts)

这两者现在明确属于 `chatRun` 的 shell / infrastructure，而不是 core 或 chat adapter。

### 2. 引入 `ChatRunRuntimeFactory`

新增：

- [ChatRunRuntimeFactory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/ChatRunRuntimeFactory.ts)

作用：

- 统一组装 `RunManager`
- 统一组装 `CompressionExecutionService`
- 统一组装 `TitleGenerationService`
- 共享 `ToolConfirmationManager`
- 共享 `ChatRunEventEmitterFactory`

结果是：

- [ChatRunService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/index.ts) 退化成更薄的 facade
- [RunManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/RunManager.ts) 改成显式依赖注入，不再自己 `new` 一组 runtime 组件

### 3. `run` 语义收紧为 `run-kernel`

原来的 `agentCore/run` 已改成：

- [run-kernel](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/run-kernel)

核心件：

- [AgentRunKernel.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/run-kernel/AgentRunKernel.ts)

这个命名更准确地表达了它是 run 级内核，而不是泛化的 run 子域。

### 4. 第一批 core contracts 落地

新增：

- [ToolConfirmationRequester.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/contracts/ToolConfirmationRequester.ts)
- [AgentEventMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/contracts/AgentEventMapper.ts)
- [ConversationStore.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/contracts/ConversationStore.ts)

这一轮不是为了“抽象而抽象”，而是先把最稳定的外部依赖接口化：

- 工具确认
- 事件映射
- 对话持久化

### 5. chat step 上下文被收窄

新增：

- [ChatStepRuntimeContextMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/mapping/ChatStepRuntimeContextMapper.ts)

现在 `ChatRunContext` 不再直接喂给 step factory，而是先映射成更窄的 step runtime context：

- `messageEntities`
- `chatId`
- `chatUuid`

这一步的意义是：

- `AssistantStepFactory` 不再依赖完整 chat preparation 结果
- step 执行只消费真正需要的 chat 运行时信息

### 6. step loop 组装继续下沉到 core

新增：

- [AgentStepRuntimeFactory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/execution/AgentStepRuntimeFactory.ts)

现在：

- `AgentStepLoop`
- `AgentStepRuntimeFactory`
- `parser/*`

都已经在 `agentCore/execution` 下。

这意味着 step loop 本身和它的 runtime wiring，已经不再留在 chat adapter / chatRun shell 侧。

### 7. parser 整体迁入 `agentCore/execution/parser`

原来的 `chatRun/streaming/parser/*` 已迁到：

- [parser](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/execution/parser)

包括：

- `ChunkParser`
- `ToolCallParser`
- `ThinkTagParser`
- `ParserState`
- `SegmentBuilder`
- parser types

同时在 parser 目录内部新增了：

- [errors.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/execution/parser/errors.ts)
- [logger.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/execution/parser/logger.ts)

这样 parser 不再依赖 `chatRun/errors` 里的 parser error，也不再依赖旧的 `chatRun` logger 包袱。

### 8. `segment-content` 与 chat-side helper 分离

纯 `MessageSegment[]` 级能力已迁入：

- [segment-content.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/execution/parser/segment-content.ts)

原来的：

- `src/main/services/chatRun/streaming/segment-utils.ts`

已经删除。

这说明：

- `extractContentFromSegments`
- `extractReasoningFromSegments`
- `hasContentInSegments`

现在都属于 core execution，而不是 chatRun。

### 9. `assistant-step` 整组迁入 chat adapter

原来的：

- `src/main/services/chatRun/runtime/assistant-step/*`

已整体迁到：

- [hostAdapters/chat/execution](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/index.ts)

包含：

- [AssistantStepFactory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/AssistantStepFactory.ts)
- [AssistantStepMessageManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/AssistantStepMessageManager.ts)
- [AssistantStepEventMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/AssistantStepEventMapper.ts)

这一步非常关键，因为它把 chat-specific 的 step wiring 明确归到了 chat adapter，而不再挂在 `chatRun/runtime`。

## 当前分层结果

### `agentCore`

当前已经比较明确属于 core 的内容：

- [run-kernel](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/run-kernel)
- [execution](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/execution)
- [tools](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/tools)
- [types](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/types)
- [contracts](/Users/gnl/Workspace/code/-i-ati/src/main/services/agentCore/contracts)

### `hostAdapters/chat`

当前已经比较明确属于 chat adapter 的内容：

- [ChatAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/ChatAgentAdapter.ts)
- [execution](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/execution/index.ts)
- [mapping](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/mapping/index.ts)
- [persistence](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/persistence/index.ts)
- [preparation](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/preparation/index.ts)
- [finalize](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/finalize/index.ts)
- [config](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/config/index.ts)

### `chatRun`

当前更接近 shell / runtime orchestration：

- [index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/index.ts)
- [runtime/RunManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/RunManager.ts)
- [runtime/AgentRun.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/AgentRun.ts)
- [runtime/ChatRunRuntimeFactory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/runtime/ChatRunRuntimeFactory.ts)
- [infrastructure](/Users/gnl/Workspace/code/-i-ati/src/main/services/chatRun/infrastructure/index.ts)

## 当前判断

经过这一轮之后，`chatRun/runtime` 已经明显收缩了：

- 不再承载 parser
- 不再承载 step factory / message manager / event mapper
- 不再承载 segment helper

也就是说，`chatRun/runtime` 现在主要承担：

- lifecycle shell
- accepted / blocking / cancel
- runtime composition
- event emitter / tool confirmation infrastructure

这比前一阶段更接近目标架构。

## 建议的下一步

下一步值得评估的，不再是继续搬小工具，而是：

1. `ChatAgentAdapter` 是否要再拆成：
   - prepare facade
   - finalize facade
   - step-context facade

2. `AgentRun` 是否还能再薄：
   - 继续向 run shell 收缩
   - 让更多 run lifecycle 逻辑下沉到 `agentCore/run-kernel`

3. `agentCore/contracts` 是否要继续补：
   - model execution
   - run trace writer
   - 更明确的 run-state / event mapping 边界
