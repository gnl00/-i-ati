# Shared Render

`shared/render` 保存 host 层可复用的 render/message state contract。

它的目标是：

- 让 committed / preview / assistant message 真源尽量单点化
- 把可复用的 host-side state fold 从具体 host 中抽出来（收敛到 `HostRenderEventMapper` 单一 fold 点）
- 避免 chat、telegram、未来 host 各自重写一套状态机

## Scope

这一层负责：

- fold agent facts or run-output facts
- 维护 assistant render/message 真源（preview + committed 状态）
- 生成 stable patch / artifact 所需的共享状态

这一层不负责：

- renderer IPC event 命名
- telegram send/edit API
- tool persistence 这种 host-specific side effect

## Layer Diagram

```text
runtime facts
  -> shared/render state fold (HostRenderEventMapper)
    -> HostOutputDispatcher (run targets / failure policy)
      -> host-specific mapper / transport policy
      -> host output protocol
```

当前走这条入口的 host：

```text
AgentEvent
  -> HostRenderEventMapper
    -> HostRenderEvent
      -> host mapper/output
```

chat 和 telegram 走这条入口；`hosts/cli` 与 `hosts/tui` 不经过 `HostRenderEvent`，
分别消费原始 `AgentEvent` 和 orchestration 的 `RunEventEnvelope`。

## Main Types And Controllers

### `AgentRenderStateReducer`

文件：

- [AgentRenderStateReducer.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/render/AgentRenderStateReducer.ts)

职责：

- 消费 `AgentEvent`
- 产出 block-oriented render state
- 维护：
  - preview message state
  - committed message state
  - ordered text / reasoning / tool blocks
  - tool call execution status

它是 `HostRenderEventMapper` 的底层 reducer，不建议由 host 直接消费。

### `HostRenderEventMapper`

文件：

- [HostRenderEventMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/render/HostRenderEventMapper.ts)

职责：

- 消费 `AgentEvent`
- 产出宿主统一输入 `HostRenderEvent`
- 在 runtime-native 事实和 host-facing render contract 之间做一次明确折叠

这是当前 host runtime 的标准入口，也是 host 侧唯一的 render 状态 fold 点
（committed / preview / lifecycle / usage 都由它收敛，见 `snapshot()`）。

### `HostStepOutputPolicy`

文件：

- [HostStepOutputPolicy.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/render/HostStepOutputPolicy.ts)

职责：

- 集中「单个 step 的 runtime 事实 -> 外部宿主可见性」的规则
- 回答某个 tool 是否对外隐藏（visible / hidden / tool-activity-only）
- 供 chat + telegram 共用，避免两处 hidden-tool 名单各自漂移

### `AgentRenderSegmentMapper`

文件：

- [AgentRenderSegmentMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/render/AgentRenderSegmentMapper.ts)

职责：

- 把 `AgentRenderMessageState.blocks + toolCalls` 转成稳定 `MessageSegment[]`
- 统一生成 text / reasoning / toolCall / error segment
- 保持 preview / committed segment identity 稳定，供 chat、telegram 和后续 host 复用

### committed assistant message entity

committed assistant message entity 的真源不在 `shared/render/`。render 侧只持有
`AgentRenderState.committed`（由 `AgentRenderStateReducer` fold 出来）；DB 实体锚点、
in-memory message list 更新和 committed artifact 由宿主侧
[ChatRenderOutput.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/runtime/ChatRenderOutput.ts)
负责。此前的 `CommittedAssistantMessageController` 已删除。

## Recommended Composition

### Standard Host Runtime Entry

```text
AgentEvent
  -> HostRenderEventMapper
    -> HostRenderEvent
      -> host transport policy / mapper
        -> host output
```

当前例子：

- chat runtime
- telegram runtime

## Current Concrete Usage

chat 侧当前大致是：

```text
ChatRenderResponder
  -> ChatRenderMapper
  -> AgentRenderSegmentMapper
  -> ChatRenderOutput (committed entity + step store)
```

telegram 侧当前大致是：

```text
TelegramRenderResponder
  -> HostStepOutputPolicy
  -> AgentRenderSegmentMapper
  -> telegram send/edit
```

## Design Rules

后续往 `shared/render` 增加内容时，优先遵守下面几条：

- 只放 host-shared state/controller contract
- 不放具体 renderer IPC 协议
- 不放 telegram-specific transport API
- 不重新引入第二套 committed/preview 真源
- 如果某个逻辑只为单一 host 的 transport 服务，就不要塞进这里

## Good Candidates To Move Here

通常适合下沉到这里的逻辑：

- committed assistant entity ownership
- preview / committed snapshot fold
- segment diff / patch generation
- stable assistant artifact generation

## Bad Candidates To Move Here

通常不适合下沉到这里的逻辑：

- telegram throttle / send / edit 调度
- renderer-specific event naming
- host-specific persistence side effects
- chat-only UI typewriter semantics

## Why This Exists

如果没有这一层，最容易发生的问题是：

- chat 有一套 preview 状态机
- telegram 又写一套 preview 状态机
- 新 host 再写第三套

最后 bug 会在不同 host 中重复出现，而且很难确认哪一份状态才是真源。

`shared/render` 的存在，就是为了把这些真源收回来。

## Unified output routing

Main runtime 的组合根向 forwarder、Run emitter factory 和 confirmation manager 注入同一个 `HostOutputDispatcher`。render 输出、Run 协议、canonical approval 都通过该分发器选择 adapter。当前 Chat responder / tool side effects 是 required consumer；其他投递失败独立记录。分发器保持每个 transport adapter 的异步顺序；Telegram 重试及 Chat snapshot 恢复由各 adapter 保持。

见 [ADR 0027](../../../../../docs/decisions/0027-unified-host-output-dispatch.md)。
