# 消息处理与保存逻辑优化

## 优化日期
2026-01-08

## 优化目标
统一消息保存逻辑，解决 streaming 阶段和 finalize 阶段保存时机混乱的问题。

---

## 核心问题

### 优化前的问题

1. **消息保存时机混乱**
   - Assistant 消息可能在 streaming 阶段保存（有工具调用时）
   - Assistant 消息也可能在 finalize 阶段保存（无工具调用时）
   - 逻辑不一致，难以维护

2. **chat.messages 数组更新分散**
   - Streaming 阶段修改内存中的 `chatEntity.messages`
   - Finalize 阶段又要处理这个数组
   - 如果中途出错，数据库和内存状态不一致

3. **文档和代码不一致**
   - 注释说 tool result 在 streaming 阶段保存
   - 实际代码是在 finalize 阶段保存
   - 造成理解困难

---

## 新方案设计

### 核心原则

1. ✅ **Streaming 阶段只更新内存**（store + session.messageEntities）
2. ✅ **Finalize 阶段统一持久化**（按顺序：assistant → tool results）
3. ✅ **Request 始终从内存状态构建**（不依赖数据库）

### 数据流

```
┌─────────────────────────────────────────────────────────────┐
│ Prepare 阶段                                                 │
├─────────────────────────────────────────────────────────────┤
│ 1. User message → 保存到 DB ✓                                │
│ 2. Initial assistant message (id: -1) → 仅内存 ✓             │
│ 3. 构建 request.messages 从 session.chatMessages ✓           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Streaming Cycle 1 阶段                                       │
├─────────────────────────────────────────────────────────────┤
│ 1. 发送 request (messages 来自内存)                          │
│ 2. 接收流式响应，更新 segments                                │
│ 3. 检测到 tool calls                                         │
│    → 更新 assistant message (仅内存) ✓                       │
│    → 追加到 request.messages ✓                               │
│    → ❌ 不保存到 DB（新方案）                                 │
│ 4. 执行工具                                                  │
│ 5. 创建 tool result message                                 │
│    → 添加到 session.messageEntities ✓                        │
│    → 追加到 request.messages ✓                               │
│    → ❌ 不保存到 DB（新方案）                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Streaming Cycle 2 阶段                                       │
├─────────────────────────────────────────────────────────────┤
│ 1. 发送 request (包含完整历史，包括 tool result)              │
│ 2. 接收最终响应，继续更新 segments                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Finalize 阶段（新方案）                                       │
├─────────────────────────────────────────────────────────────┤
│ Step 1: 保存所有 assistant 消息                              │
│    └─ 如果 id === -1 → store.addMessage() → DB ✓            │
│                                                              │
│ Step 2: 按顺序保存所有 tool result 消息                      │
│    └─ 如果 role === 'tool' && !id → store.addMessage() ✓    │
│                                                              │
│ Step 3: 更新 chat entity                                     │
│    └─ chatEntity.messages 包含完整的消息 ID 数组              │
│    └─ updateChat(chatEntity) → DB ✓                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 修改内容

### 1. MessageManager.addToolCallMessage()

**文件**: `src/renderer/src/hooks/chatSubmit/streaming/message-manager.ts`

**修改前**:
```typescript
// 立即保存到 SQLite
if (lastMessage.id === -1) {
  const msgId = await this.store.addMessage(lastMessage)
  lastMessage.id = msgId
  chatEntity.messages = [...(chatEntity.messages || []), msgId]
}
```

**修改后**:
```typescript
// 只更新内存状态，不保存到 DB
lastMessage.body.content = content || ''
lastMessage.body.toolCalls = toolCalls
this.context.request.messages.push(assistantToolCallMessage)
```

**关键变化**:
- ❌ 移除了 streaming 阶段的数据库保存
- ✅ 只更新内存中的 assistant 消息
- ✅ 追加到 request.messages 用于下一轮请求

---

### 2. MessageManager.addToolResultMessage()

**文件**: `src/renderer/src/hooks/chatSubmit/streaming/message-manager.ts`

**修改内容**:
- ✅ 更新注释，明确说明不保存到 DB
- ✅ 代码逻辑保持不变（本来就是正确的）
- ✅ 确保文档和代码一致

---

### 3. finalizePipelineV2()

**文件**: `src/renderer/src/hooks/chatSubmit/finalize.ts`

**修改内容**:
- ✅ 更新注释，明确说明统一保存顺序
- ✅ 第一步：保存所有 assistant 消息（id === -1）
- ✅ 第二步：按顺序保存所有 tool result 消息
- ✅ 移除了 "已保存的 assistant 消息更新" 的场景（不应该出现）

---

## 优势

### 1. 逻辑清晰
- 所有持久化操作统一在 finalize 阶段
- 不再有 "有时在 streaming 保存，有时在 finalize 保存" 的混乱

### 2. 数据一致性
- 内存状态和数据库状态分离清晰
- 减少了中途出错导致的数据不一致

### 3. 易于维护
- 保存逻辑集中在一个地方
- 修改保存顺序只需要改 finalize.ts

### 4. 性能优化
- 减少了 streaming 阶段的 IPC 调用
- 批量保存消息，减少数据库操作次数

---

## 测试验证

### 场景 1: 新对话（无工具调用）
**预期结果**:
- ✅ User message 在 prepare 阶段保存
- ✅ Assistant message 在 finalize 阶段保存
- ✅ chat.messages = [userId, assistantId]

### 场景 2: 新对话（有工具调用）
**预期结果**:
- ✅ User message 在 prepare 阶段保存
- ✅ Assistant message 在 finalize 阶段保存（Step 1）
- ✅ Tool result messages 在 finalize 阶段保存（Step 2）
- ✅ chat.messages = [userId, assistantId, toolId1, toolId2, ...]
- ✅ 保存顺序正确：assistant → tool results

### 场景 3: 已有对话（继续对话，有工具调用）
**预期结果**:
- ✅ 历史消息正确加载（包括之前的 tool result）
- ✅ request.messages 包含完整历史
- ✅ 新消息按正确顺序保存
- ✅ 不会出现 400 错误（tool result 缺失）

---

## 关键要点

1. **Request 构建**：始终从内存状态（session.chatMessages）构建，不依赖数据库
2. **Streaming 阶段**：只更新内存，不保存到数据库
3. **Finalize 阶段**：统一保存，顺序为 assistant → tool results
4. **数据一致性**：内存状态和数据库状态分离清晰

---

## 影响文件

- `src/renderer/src/hooks/chatSubmit/streaming/message-manager.ts`
- `src/renderer/src/hooks/chatSubmit/finalize.ts`

---

## 后续建议

1. 添加单元测试，验证保存顺序
2. 添加错误恢复机制（如果 finalize 失败）
3. 考虑添加事务支持（确保原子性）
