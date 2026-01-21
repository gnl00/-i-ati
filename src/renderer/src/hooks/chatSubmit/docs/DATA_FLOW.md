# Chat Submit 数据流 (Event-Bus)

本文档描述事件驱动模式下的消息数据流：所有业务逻辑通过服务层更新内存状态，UI 仅通过事件订阅更新。

## 核心数据位置

1. **SQLite** (持久化)
   - 存储完整对话历史（含 tool result）
   - 消息通过 `messages` 表按 `chat_id/chat_uuid` 关联，不依赖 `chat.messages`

2. **SubmissionContext.session.messageEntities** (内存)
   - 当前提交的消息集合
   - 用于构建 `request.messages`

3. **store.messages** (UI)
   - 仅由事件订阅更新
   - tool result 不直接显示为独立消息

## 事件驱动流程

```
submission.started
  ↓
session.ready (chat + workspace + controller)
  ↓
messages.loaded (history)
  ↓
message.created (user)
message.created (assistant placeholder)
  ↓
request.built
  ↓
stream.started
  ↓
stream.chunk (0..n)
tool.call.detected / tool.call.flushed
tool.exec.started / completed / failed
  ↓
stream.completed
  ↓
chat.updated
submission.completed
```

## 关键点
- UI 不直接调用业务逻辑：所有更新来自事件订阅。
- 工具结果会立即持久化到 SQLite，但不会直接插入 UI 列表。
- request 重建基于 `SubmissionContext`，避免依赖异步 store 状态。
接收响应，检测到 tool call
添加 toolCall segment
保存 tool result → SQLite (id: 2)

SQLite: [user(1), tool(2)]
store.messages: [user(1), assistant(-1)]  // assistant 通过 upsertMessage 更新
session.messageEntities: [user(1), assistant(-1), tool(2)]
request.messages: [user, assistant(with toolCalls), tool]

--- Streaming Cycle 2 ---
发送 request.messages 给 LLM（包含 tool result）
接收最终响应
更新 assistant message

SQLite: [user(1), tool(2)]
store.messages: [user(1), assistant(-1)]  // assistant 继续更新
session.messageEntities: [user(1), assistant(-1), tool(2)]
request.messages: [user, assistant(with toolCalls), tool]

--- Finalize 阶段 ---
保存 assistant message → SQLite (id: 3)

最终状态：
SQLite: [user(1), tool(2), assistant(3)]
store.messages: [user(1), assistant(3)]  // assistant 的 id 从 -1 变为 3
```

**注意**：
- `store.messages` 中只有 2 条消息（user 和 assistant），tool result 不显示
- 下次加载对话时，会从 SQLite 的 messages 表加载所有消息

---

## 最佳实践

### 1. 消息加载
- ✅ **正确**：直接从数据库加载消息，不依赖 `store.messages`
- ❌ **错误**：依赖 `store.messages` 的异步更新

```typescript
// ✅ 正确
const existingMessages = await getMessagesByChatId(chatId)
store.setMessages(existingMessages)  // 仅用于 UI
const allMessages = [...existingMessages, userMessageEntity]

// ❌ 错误
store.setMessages(loadedMessages)
const existingMessages = store.messages  // 可能为空或不完整
```

### 2. Tool Result 消息处理
- ✅ **正确**：直接保存到 SQLite，不更新 `store.messages`
- ❌ **错误**：使用 `store.addMessage()` 导致 UI 显示独立消息

```typescript
// ✅ 正确
const msgId = await saveMessage(toolResultEntity) as number
toolResultEntity.id = msgId
this.context.session.messageEntities.push(toolResultEntity)
this.context.request.messages.push(toolMsg)
// 不调用 store.addMessage 或 store.upsertMessage

// ❌ 错误
await store.addMessage(toolResultEntity)  // 会在 UI 中显示为独立消息
```

### 3. 流式更新
- ✅ **正确**：使用 `store.upsertMessage()` 仅更新内存
- ❌ **错误**：使用 `store.updateMessage()` 导致频繁 IPC 调用

```typescript
// ✅ 正确（流式场景）
this.store.upsertMessage(updated)  // 仅更新内存，不持久化

// ❌ 错误（流式场景）
await this.store.updateMessage(updated)  // 每次都调用 IPC，性能差
```

### 4. 消息同步
- ✅ **正确**：确保 `session.messageEntities` 和 `request.messages` 同步
- ❌ **错误**：只更新一个，导致数据不一致

```typescript
// ✅ 正确
this.context.session.messageEntities.push(toolResultEntity)
this.context.request.messages.push(toolMsg)

// ❌ 错误
this.context.request.messages.push(toolMsg)  // 忘记更新 session.messageEntities
```

---

## 常见问题

### Q1: 为什么 tool result 不在 UI 中显示？
**A**: 这是设计决策。Tool result 通过 `toolCall segment` 在 assistant 消息中显示，避免 UI 中出现独立的 tool 消息。但 tool result 会保存到 SQLite，用于对话历史。

### Q2: 为什么要区分 `session.messageEntities` 和 `store.messages`？
**A**:
- `session.messageEntities` - 完整的消息列表（包括 tool result），用于构建 LLM 请求
- `store.messages` - UI 显示的消息列表（不包括 tool result），用于 React 渲染

### Q3: 为什么不能依赖 `store.messages` 的异步更新？
**A**: Zustand 的状态更新是异步的，如果在调用 `store.setMessages()` 后立即读取 `store.messages`，可能读取到旧值或空值。

### Q4: 为什么 finalize 阶段只保存 `id === -1` 的消息？
**A**: 因为：
- User 消息在 prepare 阶段已保存
- Tool result 消息在 streaming 阶段已保存
- 只有 assistant 消息使用临时 ID (-1)，需要在 finalize 阶段保存

---

## 总结

本文档描述了聊天提交系统的完整数据流，关键要点：

1. **三个存储位置**：SQLite（持久化）、session.messageEntities（会话状态）、store.messages（UI 状态）
2. **消息加载**：直接从数据库加载，不依赖 Zustand 异步更新
3. **Tool result 处理**：保存到 SQLite，但不更新 UI（通过 segment 显示）
4. **流式更新**：使用 `upsertMessage` 避免频繁 IPC 调用
5. **数据同步**：确保 `session.messageEntities` 和 `request.messages` 始终同步
