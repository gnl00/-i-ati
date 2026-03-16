# Chat Submit 数据流

本文档描述当前 main-driven chat run 的数据流。核心原则只有一条：main 负责运行和持久化，renderer 只负责事件投影和 UI。

## 核心数据位置

1. **SQLite**
   - 持久化 chat、message、tool result、trace event
   - 是历史记录和 run 恢复的唯一可信来源

2. **main run context**
   - 当前 run 的内存状态
   - 包含 `chatEntity`、`messageEntities`、`request.messages`
   - 仅在 main 内部存在

3. **store.messages**
   - renderer 的投影状态
   - 只根据 `chat-run:event` 更新

## 当前流程

```
renderer invokeChatRunStart
  ↓
main ChatRunService.start
  ↓
run.accepted
run.state.changed(preparing)
chat.ready
messages.loaded
message.created(user)
message.created(assistant placeholder)
  ↓
run.state.changed(streaming)
message.updated(assistant delta)
tool.call.detected
run.state.changed(executing_tools)
tool.exec.started / completed / failed
tool.result.attached
  ↓
run.state.changed(finalizing)
chat.updated
run.completed | run.failed | run.aborted
  ↓
title.generate.* / compression.*
```

## 关键点

- assistant 流式文本和 tool 状态都在 main 内更新，然后通过 `message.updated` 投影给 renderer。
- renderer 不再重建 `request.messages`，也不再维护自己的 submit 状态机。
- `run.completed` 是交互层恢复输入框、结束 streaming UI 的唯一边界。
- title generation 和 compression 是 post-run jobs，不阻塞 `run.completed`。

## 实践约束

- 新增 chat run 逻辑时，优先改 main `ChatRunService`，不要把流程逻辑加回 renderer。
- 新增 UI 行为时，只订阅共享事件协议 `src/shared/chatRun/events.ts`。
- 如果某个状态只影响 UI 展示，就在 renderer 投影层处理；如果影响执行顺序或持久化，就放在 main。
