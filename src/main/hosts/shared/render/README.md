# Shared Render

`shared/render` 保存 host 层可复用的 render/message state contract。

它的目标是：

- 让 committed / preview / assistant message 真源尽量单点化
- 把可复用的 host-side state fold 从具体 host 中抽出来（收敛到 `HostRenderEventMapper` 单一 fold 点）
- 避免 chat、telegram、未来 host 各自重写一套状态机

## Scope

这一层负责：

- fold agent facts or run-output facts
- 维护 assistant render/message 真源
- 维护 committed assistant entity
- 生成 stable patch / artifact 所需的共享状态

这一层不负责：

- renderer IPC event 命名
- telegram send/edit API
- tool persistence 这种 host-specific side effect

## Layer Diagram

```text
runtime facts
  -> shared/render state fold (HostRenderEventMapper)
    -> host-specific mapper / transport policy
      -> host output protocol
```

当前有两种入口：

```text
AgentEvent
  -> HostRenderEventMapper
    -> HostRenderEvent
      -> host mapper/output
```

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

### `CommittedAssistantMessageController`

文件：

- [CommittedAssistantMessageController.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/render/CommittedAssistantMessageController.ts)

职责：

- 持有 committed assistant message entity 真源
- 更新 in-memory message list
- 生成 committed assistant artifact

这个 controller 的意义是把“提交 assistant message”这件事从具体 host output 中抽出来。

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
  -> CommittedAssistantMessageController
  -> ChatRenderOutput
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
