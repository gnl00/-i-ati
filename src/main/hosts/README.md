# Hosts

`hosts/` 是宿主适配层。

它负责把不同宿主世界的输入、状态、输出和交互语义，映射到当前 agent runtime 上。

它不是应用入口本身，也不是 runtime core。

## Position

当前主结构建议理解为：

```text
application entry
  -> orchestration shell
    -> agent runtime
      -> hosts
        -> host-specific transport / persistence / UI protocol
```

更具体一点：

```text
IPC / Telegram gateway / scheduler / other app services
  -> chat/run orchestration
    -> agent/*
      -> hosts/*
        -> renderer IPC / telegram bot API / host persistence
```

分层职责：

- `agent`
  - runtime contracts
  - loop / tool execution
  - runtime-native facts
- `hosts`
  - host semantics adaptation
  - render/message state folding
  - host-specific output protocol
- orchestration shell
  - accepted / cancel / emitter / confirmation / finalization

## Core Rule

`hosts` 可以依赖 `agent/*`。

`agent/*` 不应反向依赖 `hosts/*`。

`hosts` 不应承担：

- app entry handler
- runtime orchestration
- tool execution

`hosts` 应承担：

- host input adaptation
- host-facing render/message state adaptation
- host-specific output protocol
- host-scoped persistence or transport glue

## Internal Layers

当前 `hosts` 内部推荐按下面 4 层理解：

```text
host input adapter
  -> shared host state/controller
    -> host-specific mapper/policy
      -> host-specific output/transport
```

### 1. Input Adapter

把宿主输入映射成当前 runtime 可接受的输入。

例子：

- [ChatAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/ChatAgentAdapter.ts)
- [TelegramAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/telegram/TelegramAgentAdapter.ts)

### 2. Shared Host State / Controller

这一层不理解具体 UI 组件或 Telegram API，只负责维护宿主侧共享真源。

例子：

- [AgentRenderStateReducer.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/render/AgentRenderStateReducer.ts)
- [HostRenderStateController.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/render/HostRenderStateController.ts)
- [CommittedAssistantMessageController.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/render/CommittedAssistantMessageController.ts)

### 3. Host-Specific Mapper / Policy

这一层开始进入宿主差异，但仍然不直接做 IO。

例子：

- [ChatRenderMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/runtime/ChatRenderMapper.ts)
- [TelegramRenderMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/telegram/runtime/TelegramRenderMapper.ts)
- [TelegramTransportStateController.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/telegram/runtime/TelegramTransportStateController.ts)

### 4. Host Output / Transport

真正发 renderer event、telegram edit/send、持久化 step/tool message 的地方。

例子：

- [ChatRenderOutput.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/runtime/ChatRenderOutput.ts)
- [TelegramRenderResponder.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/telegram/runtime/TelegramRenderResponder.ts)

## Host Runtime Entry

当前 host runtime 统一消费 `HostRenderEvent`。

```text
AgentEvent
  -> HostRenderEventMapper
    -> HostRenderEvent
      -> host state / mapper / transport
```

当前例子：

- chat runtime
- telegram runtime

`RunEventEnvelope` 仍然存在于 orchestration/run-output 层，但不再是 host runtime 的主输入。

## Current Concrete Shape

当前 chat 和 telegram 的主链分别是：

```text
chat
  AgentEvent
    -> HostRenderEventMapper
      -> HostRenderEvent
        -> ChatRenderResponder
          -> HostRenderStateController
          -> ChatRenderMapper
          -> CommittedAssistantMessageController
          -> ChatRenderOutput
            -> ChatEventMapper / step store / renderer protocol
```

```text
telegram
  AgentEvent
    -> HostRenderEventMapper
      -> HostRenderEvent
        -> TelegramRenderResponder
          -> HostRenderStateController
          -> TelegramTransportStateController
          -> TelegramRenderMapper
            -> telegram send/edit transport
```

## Recommended Extension Pattern

后续新增 host 时，优先按下面顺序思考：

1. 先把 runtime 边界统一折叠成 `HostRenderEvent`
2. 是否可以直接复用 `shared/render` 里的已有 controller
3. 哪些逻辑属于 host-specific policy
4. 哪些逻辑才是真正的 transport / persistence

推荐目录骨架：

```text
src/main/hosts/<host>/
  <Host>AgentAdapter.ts
  runtime/
    <Host>RenderMapper.ts
    <Host>TransportStateController.ts
    <Host>Responder.ts
  persistence/
  mapping/
```

不是每个 host 都必须有所有目录，但职责边界应保持一致。

## Design Constraints

后续新增代码时，优先遵守这些约束：

- 不要在 host output 层重新维护第二套 committed/preview 真源
- 不要把 host-specific transport 策略塞回 shared state reducer
- 不要让 renderer/telegram 传输协议反向污染 agent runtime contract
- 不要把 chat host 的事件协议当成所有 host 的通用协议
- 能下沉到 `shared/render` 的 committed/preview/message patch 逻辑，应优先下沉

## Current Gaps

当前 `hosts` 层已经有稳定骨架，但还有两项后续工作：

1. event 边界还没有完全收敛
   - 通用 run event 和 chat-specific render protocol 仍有混杂
2. 部分命名仍带历史包袱
   - 某些 `chat runtime` 名字已经比实际职责更宽或更窄

这两项不阻塞当前扩展，但后续继续新增 host 前最好继续收紧。
