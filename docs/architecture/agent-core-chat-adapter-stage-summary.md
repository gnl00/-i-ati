# Agent Core / Chat Adapter Stage Summary

> 这份文档记录的是早期拆分过程中的阶段性总结，部分命名与路径已过时。
> 当前结构请优先参考 [chat-runtime-architecture-current.md](/Users/gnl/Workspace/code/-i-ati/docs/architecture/chat-runtime-architecture-current.md)。

## 背景

这一阶段的目标，不再是单纯把 `chatSubmit` 改名为 `chatRun`，而是继续把运行时拆成更清晰的三层：

- runtime core
- `hosts/chat`
  - chat 领域适配层
- `chatRun`
  - shell / runtime orchestration

重点不是继续拆 service 数量，而是把“哪些属于 runtime core、哪些属于 chat adapter、哪些属于 shell”逐步做实。

## 这一阶段完成的关键调整

### 1. 明确 shell / infrastructure 边界

`RunEventEmitterFactory` 和 `ToolConfirmationManager` 已迁到：

- [event-emitter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/infrastructure/event-emitter.ts)
- [tool-confirmation.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/infrastructure/tool-confirmation.ts)

这两者现在明确属于 `chatRun` 的 shell / infrastructure，而不是 core 或 chat adapter。

### 2. 引入 `RunRuntimeFactory`

新增：

- [RunRuntimeFactory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/runtime/RunRuntimeFactory.ts)

作用：

- 统一组装 `RunManager`
- 统一组装 `CompressionExecutionService`
- 统一组装 `TitleGenerationService`
- 共享 `ToolConfirmationManager`
- 共享 `RunEventEmitterFactory`

结果是：

- [RunService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/index.ts) 退化成更薄的 facade
- [RunManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/runtime/RunManager.ts) 改成显式依赖注入，不再自己 `new` 一组 runtime 组件

### 3. `run` 语义收紧为 `run-kernel`

这一步是历史阶段性调整。
`run-kernel` 后续已经随旧 runtime 一起移除，不再属于当前主路径架构。

### 4. 第一批 core ports 落地

新增：

- `ToolConfirmationRequester.ts`
- `AgentMessageEventSink.ts`
- `ConversationStore.ts`

这一轮不是为了“抽象而抽象”，而是先把最稳定的外部依赖接口化：

- 工具确认
- 消息事件下沉出口
- 对话持久化

### 5. chat step 上下文被收窄

新增：

- [ChatStepRuntimeContextMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/mapping/ChatStepRuntimeContextMapper.ts)

现在 `ChatRunContext` 不再直接喂给 step factory，而是先映射成更窄的 step runtime context：

- `messageEntities`
- `chatId`
- `chatUuid`

这一步的意义是：

- `AssistantStepFactory` 不再依赖完整 chat preparation 结果
- step 执行只消费真正需要的 chat 运行时信息

### 6. step loop 与 parser 曾下沉到 runtime core

这部分旧实现后续已经删除，等价职责已经转到 `next/*`。

### 8. `segment-content` 与 chat-side helper 分离

纯 `MessageSegment[]` 级能力已迁入：

- 现已稳定落在 `src/main/services/messages/MessageSegmentContent.ts`

原来的：

- `src/main/orchestration/chat/run/streaming/segment-utils.ts`

已经删除。

这说明这类 `MessageSegment[]` 级能力已经脱离旧 streaming 目录，落到更稳定的共享位置。

### 9. `assistant-step` 整组迁入 chat adapter

原来的：

- `src/main/orchestration/chat/run/runtime/assistant-step/*`

已整体迁到：

- `hosts/chat/legacy` 已整体移除

包含：

- `AssistantStepFactory` 已移除；legacy loop wiring 不再保留运行时入口
- `ChatStepCommitter` 已移除
- `AssistantStepEventMapper` 已移除

这一步非常关键，因为它把 chat-specific 的 step wiring 明确归到了 chat adapter，而不再挂在 `chatRun/runtime`。

## 当前分层结果

### runtime core

当前主路径已经切到 `agent/*` 和 `next/*`。

### `hosts/chat`

当前已经比较明确属于 chat adapter 的内容：

- [ChatAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/ChatAgentAdapter.ts)
- legacy chat-side step wiring 已从主代码移除
- [mapping](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/mapping/index.ts)
- [persistence](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/persistence/index.ts)
- [preparation](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/preparation/index.ts)
- [finalize](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/finalize/index.ts)
- [config](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/config/index.ts)

### `chatRun`

当前更接近 shell / runtime orchestration：

- [index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/index.ts)
- [runtime/RunManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/runtime/RunManager.ts)
- [runtime/AgentRun.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/runtime/AgentRun.ts)
- [runtime/RunRuntimeFactory.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/runtime/RunRuntimeFactory.ts)
- [infrastructure](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/infrastructure/index.ts)

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
   - 让更多 run lifecycle 逻辑下沉到当前 runtime core

3. runtime contracts 是否还要继续补：
   - model execution
   - run trace writer
   - 更明确的 run-state / event mapping 边界
