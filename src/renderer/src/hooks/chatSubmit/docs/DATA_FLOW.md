# Chat Submit 数据流文档

本文档描述了聊天提交系统中消息的完整数据流，包括消息的创建、更新、持久化和加载过程。

## 核心概念

### 三个消息存储位置

1. **SQLite 数据库** - 持久化存储
   - 通过 IPC 调用主进程进行读写
   - 存储完整的对话历史（包括 tool result 消息）
   - 每个 chat 维护一个 `messages: number[]` 数组，存储消息 ID

2. **session.messageEntities** - 当前会话的内存状态
   - 类型：`MessageEntity[]`
   - 包含当前会话的所有消息（包括未持久化的临时消息）
   - 用于构建发送给 LLM 的请求
   - finalize 阶段会将未保存的消息持久化到 SQLite

3. **store.messages** - Zustand 状态（UI 显示）
   - 类型：`MessageEntity[]`
   - 用于 React 组件渲染
   - 通过 `store.upsertMessage()` 更新（流式场景）
   - 通过 `store.addMessage()` 添加（持久化场景）
   - **注意**：tool result 消息不会添加到这里，避免在 UI 中显示为独立消息

### 消息类型

- **user** - 用户消息
- **assistant** - 助手消息（可能包含 toolCalls）
- **tool** - 工具执行结果消息

## 完整数据流

### 阶段 1: Prepare（准备阶段）

**文件**: `prepare.ts`

#### 1.1 新对话
```
用户输入
  ↓
创建 chat entity → 保存到 SQLite
  ↓
创建 user message entity → 保存到 SQLite (store.addMessage)
  ↓
创建 initial assistant message (id: -1, 临时消息)
  ↓
构建 messageEntities = [userMessage, initialAssistantMessage]
  ↓
构建 request.messages = messageEntities.map(m => m.body)
```

#### 1.2 已有对话
```
用户输入
  ↓
从 SQLite 加载 chat entity
  ↓
从 SQLite 加载历史消息 (getMessageByIds)
  ↓  ↓
  ↓  └→ 更新 store.messages（仅用于 UI 显示）
  ↓
existingMessages = 从数据库加载的消息（不依赖 store.messages）
  ↓
创建 user message entity → 保存到 SQLite (store.addMessage)
  ↓
创建 initial assistant message (id: -1, 临时消息)
  ↓
构建 messageEntities = [...existingMessages, userMessage, initialAssistantMessage]
  ↓
构建 request.messages = messageEntities.map(m => m.body)
```

**关键优化点**：
- 直接使用从数据库加载的 `existingMessages`，不依赖 `store.messages`
- 避免 Zustand 状态更新延迟导致的消息丢失问题

---

### 阶段 2: Streaming（流式处理阶段）

**文件**: `streaming/orchestrator.ts`, `message-manager.ts`

#### 2.1 Cycle 1 - 初始请求

```
发送 request.messages 给 LLM
  ↓
接收流式响应 chunks
  ↓
解析 chunks (parser.parse)
  ↓
更新 assistant message 的 segments
  ↓
调用 messageManager.updateLastMessage()
  ↓  ↓
  ↓  └→ 更新 session.messageEntities（内存）
  ↓  └→ 调用 store.upsertMessage（触发 UI 更新，不持久化）
  ↓
检测到 tool calls
  ↓
调用 messageManager.addToolCallMessage()
  ↓  ↓
  ↓  └→ 添加 assistant message (with toolCalls) 到 request.messages
  ↓  └→ 更新最后一条消息，添加 toolCalls 字段
  ↓
执行工具 (executor.execute)
  ↓
添加 toolCall segment（用于 UI 显示）
  ↓
调用 messageManager.addToolResultMessage()
  ↓  ↓
  ↓  └→ 保存 tool result 到 SQLite (saveMessage，不通过 store)
  ↓  └→ 添加到 session.messageEntities
  ↓  └→ 添加到 request.messages
  ↓  └→ 不更新 store.messages（避免 UI 显示为独立消息）
  ↓
继续下一个 cycle
```

#### 2.2 Cycle 2 - 包含 Tool Result 的请求

```
发送 request.messages 给 LLM
（此时 request.messages 包含：user → assistant (with toolCalls) → tool result）
  ↓
接收流式响应 chunks
  ↓
解析 chunks (parser.parse)
  ↓
更新 assistant message 的 segments
  ↓
调用 messageManager.updateLastMessage()
  ↓
没有更多 tool calls，结束循环
```

**关键优化点**：
- Tool result 消息直接保存到 SQLite，不通过 `store.addMessage()`
- 避免 tool result 在 UI 中显示为独立消息
- Tool result 通过 toolCall segment 在 assistant 消息中显示

---

### 阶段 3: Finalize（完成阶段）

**文件**: `finalize.ts`

```
流式处理完成
  ↓
查找未保存的消息 (id === -1)
  ↓
遍历未保存的消息
  ↓
提取 content from segments（如果 content 为空）
  ↓
调用 store.addMessage() 保存到 SQLite
  ↓  ↓
  ↓  └→ 保存到 SQLite（通过 IPC）
  ↓  └→ 返回消息 ID
  ↓  └→ 更新 store.messages（触发 UI 更新）
  ↓
更新 chat.messages 数组（添加新消息 ID）
  ↓
更新 chat entity 到 SQLite
  ↓
更新 chat list（UI）
```

**关键点**：
- 只保存 `id === -1` 的临时消息（assistant 消息）
- Tool result 消息已在 streaming 阶段保存，不会重复保存
- 最终更新 chat.messages 数组，包含所有消息 ID

---

## 完整的消息生命周期示例

### 场景：用户发送消息，触发工具调用

```
初始状态：
SQLite: []
store.messages: []
session.messageEntities: []
request.messages: []

--- Prepare 阶段 ---
创建 user message → 保存到 SQLite (id: 1)
创建 assistant message (id: -1, 临时)

SQLite: [user(1)]
store.messages: [user(1)]
session.messageEntities: [user(1), assistant(-1)]
request.messages: [user, assistant(empty)]

--- Streaming Cycle 1 ---
发送 request.messages 给 LLM
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
更新 chat.messages = [1, 2, 3]

最终状态：
SQLite: [user(1), tool(2), assistant(3)]
store.messages: [user(1), assistant(3)]  // assistant 的 id 从 -1 变为 3
chat.messages: [1, 2, 3]
```

**注意**：
- `store.messages` 中只有 2 条消息（user 和 assistant），tool result 不显示
- `chat.messages` 中有 3 个 ID，包含所有消息（user, tool, assistant）
- 下次加载对话时，会从 SQLite 加载所有 3 条消息

---

## 最佳实践

### 1. 消息加载
- ✅ **正确**：直接从数据库加载消息，不依赖 `store.messages`
- ❌ **错误**：依赖 `store.messages` 的异步更新

```typescript
// ✅ 正确
let existingMessages: MessageEntity[] = []
if (chatEntity.messages && chatEntity.messages.length > 0) {
  existingMessages = await getMessageByIds(chatEntity.messages)
  store.setMessages(existingMessages)  // 仅用于 UI
}
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
