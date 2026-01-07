# MessageManager 抽取：统一状态管理

## 目标

解决 `streaming.ts` 中的**状态同步混乱**问题，将 12 次手动同步合并为 1 次原子更新。

## 当前问题分析

### 问题位置

在 `streaming.ts` 中有 **4 个位置**，每个位置都需要 **3 次同步**：

```typescript
// 同步模式（重复 12 次）
context.session.messageEntities = updatedMessages     // ← 同步 1
context.session.chatMessages = updatedMessages.map(...)  // ← 同步 2
setMessages(updatedMessages)                          // ← 同步 3
```

### 具体位置

| 位置 | 行号 | 场景 | 同步次数 |
|------|------|------|---------|
| `applyParseResult` | 68-70 | 解析流式 chunk 后 | 3 次 |
| `applyNonStreamingResponse` | 174-176 | 非流式响应 | 3 次 |
| `handleToolCalls - 成功` | 287-289 | 工具执行成功 | 3 次 |
| `handleToolCalls - 失败` | 304-306 | 工具执行失败 | 3 次 |
| **总计** | - | - | **12 次** |

### 问题影响

1. **容易遗漏同步** - 导致状态不一致（如之前的 `applyParseResult` bug）
2. **代码冗余** - 相同的同步逻辑重复 12 次
3. **维护成本高** - 修改同步逻辑需要改 12 个地方
4. **容易出错** - 手动复制粘贴容易引入 bug

---

## 解决方案：MessageManager

### 核心思想

**封装所有消息更新逻辑，提供原子更新方法**，确保：
- ✅ 单次调用自动完成 3 次同步
- ✅ 类型安全，避免遗漏
- ✅ 易于测试，无需 mock 整个 context
- ✅ 可观测，便于调试

### 设计原则

1. **单一职责**：只负责消息的更新和同步
2. **原子性**：每次更新保证 3 个地方同步
3. **类型安全**：提供类型化的更新方法
4. **易于测试**：独立类，无副作用

---

## 架构设计

### 重构前

```
┌─────────────────────────────────────────────────────┐
│  applyParseResult()                                 │
│  ├─ const updatedMessages = [...entities]           │
│  ├─ 更新 segments                                   │
│  ├─ context.session.messageEntities = updatedMessages  ← 手动同步 1
│  ├─ context.session.chatMessages = map(...)         ← 手动同步 2
│  └─ setMessages(updatedMessages)                    ← 手动同步 3
└─────────────────────────────────────────────────────┘
```

### 重构后

```
┌─────────────────────────────────────────────────────┐
│  MessageManager                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  updateMessages(updater)                     │  │
│  │    ├─ const updated = updater(entities)      │  │
│  │    ├─ context.session.messageEntities = ...  │  │
│  │    ├─ context.session.chatMessages = map(...) │  │
│  │    └─ setMessages(...)                       │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         △
         │ 使用
         │
┌─────────────────────────────────────────────────────┐
│  applyParseResult()                                 │
│  ├─ messageManager.updateMessages(entities => {     │
│  │    // 业务逻辑：更新 segments                     │
│  │    return updatedEntities                        │
│  │  })                                              │
│  └─ ✅ 自动完成 3 次同步                             │
└─────────────────────────────────────────────────────┘
```

---

## MessageManager API 设计

### 类型定义

```typescript
// types.ts 新增

export interface MessageManagerDeps {
  context: StreamingContext
  setMessages: (messages: MessageEntity[]) => void
}

export type MessageUpdater = (
  entities: MessageEntity[]
) => MessageEntity[]
```

### 核心方法

#### 1. `updateMessages(updater)` - 原子更新

**用途**：通用的消息更新方法

**实现**：
```typescript
updateMessages(updater: MessageUpdater): MessageEntity[] {
  const updated = updater(this.context.session.messageEntities)

  // 单次同步所有 3 个地方
  this.context.session.messageEntities = updated
  this.context.session.chatMessages = updated.map(msg => msg.body)
  this.deps.setMessages(updated)

  return updated
}
```

**使用示例**：
```typescript
// 更新最后一条消息的 segments
messageManager.updateMessages(entities => {
  const last = entities[entities.length - 1]
  last.body.segments = [...(last.body.segments || []), newSegment]
  return entities
})
```

---

#### 2. `appendSegmentToLast(segment)` - 添加 segment

**用途**：向最后一条消息添加 segment（常用场景）

**实现**：
```typescript
appendSegmentToLast(segment: MessageSegment): MessageEntity[] {
  return this.updateMessages(entities => {
    const last = entities[entities.length - 1]
    if (!last.body.segments) {
      last.body.segments = []
    }
    last.body.segments.push(segment)
    return entities
  })
}
```

**使用示例**：
```typescript
// 在 applyParseResult 中
if (result.reasoningDelta.trim()) {
  messageManager.appendSegmentToLastMessage({
    type: 'reasoning',
    content: result.reasoningDelta,
    timestamp: Date.now()
  })
}
```

---

#### 3. `updateLastMessage(updater)` - 更新最后一条消息

**用途**：只更新最后一条消息（避免操作整个数组）

**实现**：
```typescript
updateLastMessage(
  updater: (message: MessageEntity) => MessageEntity
): MessageEntity[] {
  return this.updateMessages(entities => {
    const lastIndex = entities.length - 1
    const last = entities[lastIndex]
    entities[lastIndex] = updater(last)
    return entities
  })
}
```

**使用示例**：
```typescript
// 在 applyNonStreamingResponse 中
messageManager.updateLastMessage(message => ({
  body: {
    role: 'assistant',
    model: this.context.meta.model.name,
    content: resp.content,
    segments: [{
      type: 'text',
      content: resp.content,
      timestamp: Date.now()
    }]
  }
}))
```

---

#### 4. `addToolResultMessage(toolMsg)` - 添加 tool result

**用途**：添加工具结果消息到 session 和 request

**实现**：
```typescript
addToolResultMessage(toolMsg: ChatMessage): void {
  this.updateMessages(entities => [...entities, { body: toolMsg }])
  this.context.request.messages.push(toolMsg)
}
```

**使用示例**：
```typescript
// 在 handleToolCalls 中
const toolFunctionMessage: ChatMessage = {
  role: 'tool',
  name: toolCall.function,
  toolCallId: toolCall.id || `call_${uuidv4()}`,
  content: handleToolCallResult(toolCall.function, results),
  segments: []
}
messageManager.addToolResultMessage(toolFunctionMessage)
```

---

## 实施步骤

### Step 1: 创建 MessageManager 类（30分钟）

**文件**：`src/renderer/src/hooks/chatSubmit/streaming/message-manager.ts`

**内容**：
```typescript
import type {
  MessageEntity,
  MessageSegment,
  ChatMessage,
  StreamingContext,
  MessageUpdater
} from '../types'

export class MessageManager {
  constructor(
    private readonly context: StreamingContext,
    private readonly setMessages: (messages: MessageEntity[]) => void
  ) {}

  /**
   * 原子更新消息（自动同步 3 个地方）
   * @param updater 更新函数，接收当前消息列表，返回更新后的消息列表
   * @returns 更新后的消息列表
   */
  updateMessages(updater: MessageUpdater): MessageEntity[] {
    const updated = updater(this.context.session.messageEntities)

    // 单次同步所有 3 个地方
    this.context.session.messageEntities = updated
    this.context.session.chatMessages = updated.map(msg => msg.body)
    this.setMessages(updated)

    return updated
  }

  /**
   * 向最后一条消息添加 segment
   * @param segment 要添加的 segment
   * @returns 更新后的消息列表
   */
  appendSegmentToLastMessage(segment: MessageSegment): MessageEntity[] {
    return this.updateMessages(entities => {
      const last = entities[entities.length - 1]
      if (!last.body.segments) {
        last.body.segments = []
      }
      last.body.segments.push(segment)
      return entities
    })
  }

  /**
   * 批量添加多个 segments（智能合并）
   * @param segments 要添加的 segments 数组
   * @returns 更新后的消息列表
   */
  appendSegmentsToLastMessage(segments: MessageSegment[]): MessageEntity[] {
    return this.updateMessages(entities => {
      const last = entities[entities.length - 1]
      if (!last.body.segments) {
        last.body.segments = []
      }
      last.body.segments.push(...segments)
      return entities
    })
  }

  /**
   * 更新最后一条消息
   * @param updater 更新函数，接收最后一条消息，返回更新后的消息
   * @returns 更新后的消息列表
   */
  updateLastMessage(
    updater: (message: MessageEntity) => MessageEntity
  ): MessageEntity[] {
    return this.updateMessages(entities => {
      const lastIndex = entities.length - 1
      const last = entities[lastIndex]
      entities[lastIndex] = updater(last)
      return entities
    })
  }

  /**
   * 添加 tool result 消息（同时更新 session 和 request）
   * @param toolMsg 工具结果消息
   */
  addToolResultMessage(toolMsg: ChatMessage): void {
    this.updateMessages(entities => [...entities, { body: toolMsg }])
    this.context.request.messages.push(toolMsg)
  }

  /**
   * 获取当前消息列表
   */
  getMessages(): MessageEntity[] {
    return this.context.session.messageEntities
  }

  /**
   * 获取最后一条消息
   */
  getLastMessage(): MessageEntity {
    const entities = this.context.session.messageEntities
    return entities[entities.length - 1]
  }
}
```

**验收标准**：
- ✅ 文件创建完成
- ✅ TypeScript 编译无错误
- ✅ 所有方法都有 JSDoc 注释

---

### Step 2: 重构 `applyParseResult`（20分钟）

**文件**：`src/renderer/src/hooks/chatSubmit/streaming.ts`

**修改前**（42-71行）：
```typescript
const applyParseResult = (
  context: StreamingContext,
  result: ParseResult,
  setMessages: (messages: MessageEntity[]) => void
) => {
  const updatedMessages = [...context.session.messageEntities]
  const lastMessage = updatedMessages[updatedMessages.length - 1]

  if (!lastMessage.body.segments) {
    lastMessage.body.segments = []
  }

  let segments = [...lastMessage.body.segments]
  const segmentBuilder = new SegmentBuilder()

  // 应用 reasoning delta
  if (result.reasoningDelta.trim()) {
    segments = segmentBuilder.appendSegment(segments, result.reasoningDelta, 'reasoning')
  }

  // 应用 text delta
  if (result.contentDelta.trim()) {
    segments = segmentBuilder.appendSegment(segments, result.contentDelta, 'text')
  }

  lastMessage.body.segments = segments
  context.session.messageEntities = updatedMessages    // ← 手动同步 1
  context.session.chatMessages = updatedMessages.map(msg => msg.body)  // ← 手动同步 2
  setMessages(updatedMessages)                         // ← 手动同步 3
}
```

**修改后**：
```typescript
const applyParseResult = (
  context: StreamingContext,
  result: ParseResult,
  setMessages: (messages: MessageEntity[]) => void
) => {
  const messageManager = new MessageManager(context, setMessages)
  const segmentBuilder = new SegmentBuilder()

  const lastMessage = messageManager.getLastMessage()

  if (!lastMessage.body.segments) {
    messageManager.updateLastMessage(msg => {
      msg.body.segments = []
      return msg
    })
  }

  let segments = [...(lastMessage.body.segments || [])]

  // 应用 reasoning delta
  if (result.reasoningDelta.trim()) {
    segments = segmentBuilder.appendSegment(segments, result.reasoningDelta, 'reasoning')
  }

  // 应用 text delta
  if (result.contentDelta.trim()) {
    segments = segmentBuilder.appendSegment(segments, result.contentDelta, 'text')
  }

  // 原子更新（自动完成 3 次同步）
  messageManager.updateLastMessage(msg => ({
    ...msg,
    body: {
      ...msg.body,
      segments
    }
  }))
}
```

**验收标准**：
- ✅ 功能与重构前完全一致
- ✅ 消除了 3 次手动同步
- ✅ 集成测试通过

---

### Step 3: 重构 `applyNonStreamingResponse`（15分钟）

**文件**：`src/renderer/src/hooks/chatSubmit/streaming.ts`

**修改前**（160-177行）：
```typescript
private applyNonStreamingResponse(resp: IUnifiedResponse) {
  const updatedMessages = [...this.context.session.messageEntities]
  updatedMessages[updatedMessages.length - 1] = {
    body: {
      role: 'assistant',
      model: this.context.meta.model.name,
      content: resp.content,
      segments: [{
        type: 'text',
        content: resp.content,
        timestamp: Date.now()
      }]
    }
  }
  this.deps.setMessages(updatedMessages)                    // ← 手动同步 1
  this.context.session.messageEntities = updatedMessages    // ← 手动同步 2
  this.context.session.chatMessages = updatedMessages.map(msg => msg.body)  // ← 手动同步 3
}
```

**修改后**：
```typescript
private applyNonStreamingResponse(resp: IUnifiedResponse) {
  const messageManager = new MessageManager(this.context, this.deps.setMessages)

  messageManager.updateLastMessage(() => ({
    body: {
      role: 'assistant',
      model: this.context.meta.model.name,
      content: resp.content,
      segments: [{
        type: 'text',
        content: resp.content,
        timestamp: Date.now()
      }]
    }
  }))
}
```

**验收标准**：
- ✅ 功能与重构前完全一致
- ✅ 消除了 3 次手动同步
- ✅ 代码从 18 行减少到 12 行

---

### Step 4: 重构 `handleToolCalls`（30分钟）

**文件**：`src/renderer/src/hooks/chatSubmit/streaming.ts`

#### 4.1 成功分支（242-289行）

**修改前**：
```typescript
// ... 工具执行逻辑

const updatedMessages = [...this.context.session.messageEntities]
const currentBody = updatedMessages[updatedMessages.length - 1].body

if (!currentBody.segments) {
  currentBody.segments = []
}

currentBody.segments.push({
  type: 'toolCall',
  name: toolCall.function,
  content: results,
  cost: timeCosts,
  timestamp: Date.now()
})

updatedMessages[updatedMessages.length - 1] = {
  body: {
    ...currentBody,
    role: 'assistant',
    model: this.context.meta.model.name
  }
}
this.deps.setMessages(updatedMessages)                    // ← 手动同步 1
this.context.session.messageEntities = updatedMessages    // ← 手动同步 2
this.context.session.chatMessages = updatedMessages.map(msg => msg.body)  // ← 手动同步 3

this.context.request.messages.push(toolFunctionMessage)
```

**修改后**：
```typescript
// ... 工具执行逻辑

const messageManager = new MessageManager(this.context, this.deps.setMessages)

// 添加 toolCall segment
messageManager.appendSegmentToLastMessage({
  type: 'toolCall',
  name: toolCall.function,
  content: results,
  cost: timeCosts,
  timestamp: Date.now()
})

// 添加 tool result 消息
messageManager.addToolResultMessage(toolFunctionMessage)
```

#### 4.2 失败分支（292-307行）

**修改前**：
```typescript
} catch (error: any) {
  console.error('Tool call error:', error)
  const updatedMessages = [...this.context.session.messageEntities]
  const currentBody = updatedMessages[updatedMessages.length - 1].body
  updatedMessages[updatedMessages.length - 1] = {
    body: {
      ...currentBody,
      role: 'assistant',
      content: this.context.streaming.gatherContent,
      model: this.context.meta.model.name
    }
  }
  this.deps.setMessages(updatedMessages)                    // ← 手动同步 1
  this.context.session.messageEntities = updatedMessages    // ← 手动同步 2
  this.context.session.chatMessages = updatedMessages.map(msg => msg.body)  // ← 手动同步 3
}
```

**修改后**：
```typescript
} catch (error: any) {
  console.error('Tool call error:', error)
  const messageManager = new MessageManager(this.context, this.deps.setMessages)

  messageManager.updateLastMessage(msg => ({
    body: {
      ...msg.body,
      role: 'assistant',
      content: this.context.streaming.gatherContent,
      model: this.context.meta.model.name
    }
  }))
}
```

**验收标准**：
- ✅ 成功和失败分支都正确更新
- ✅ 消除了 6 次手动同步
- ✅ 代码从 48 行减少到 20 行

---

### Step 5: 修复 finalize.ts 依赖（15分钟）

**文件**：`src/renderer/src/hooks/chatSubmit/finalize.ts`

**修改前**（85-86行）：
```typescript
const messageToSave: MessageEntity = {
  ...lastMessage,
  chatId: chatEntity.id,
  chatUuid: chatEntity.uuid
}
```

**问题**：`lastMessage` 来自 `useChatStore.getState().messages`（第 87 行），绕过了 builder

**修改后**：
```typescript
export const finalizePipelineV2 = async (
  builder: StreamingContextProvider,
  deps: FinalizeDeps
): Promise<void> => {
  const context = builder.requireStreamingContext()
  const { session, streaming, input, meta } = context
  const { chatEntity } = session

  // ❌ 删除这行
  // const currentMessages = useChatStore.getState().messages
  // const lastMessage = currentMessages[currentMessages.length - 1]

  // ✅ 使用 context 中的数据
  const lastMessage = session.messageEntities[session.messageEntities.length - 1]

  const {
    chatTitle,
    setChatTitle,
    setLastMsgStatus,
    setReadStreamState,
    updateChatList,
    titleGenerateEnabled,
    titleGenerateModel,
    selectedModel,
    providers
  } = deps

  setLastMsgStatus(true)
  setReadStreamState(false)

  if (!chatTitle || (chatTitle === 'NewChat')) {
    // ... 标题生成逻辑
  }

  if (streaming.gatherContent || streaming.gatherReasoning) {
    const messageToSave: MessageEntity = {
      ...lastMessage,
      chatId: chatEntity.id,
      chatUuid: chatEntity.uuid
    }

    // ... 持久化逻辑
  }
}
```

**验收标准**：
- ✅ 不再直接访问 `useChatStore.getState()`
- ✅ 通过 builder 获取 context
- ✅ 集成测试通过

---

### Step 6: 集成测试和验证（30分钟）

**测试场景**：

1. **基本流式对话**
   - 发送简单消息："Hello"
   - 验证消息正确显示
   - 验证 state 同步（messageEntities === chatMessages.map）

2. **Think Tag 解析**
   - 发送包含 think tag 的消息
   - 验证 reasoning segment 正确创建
   - 验证 state 同步

3. **工具调用**
   - 发送需要工具调用的消息（如 web_search）
   - 验证 toolCall segment 正确添加
   - 验证 tool result message 正确添加
   - 验证 request.messages 同步

4. **工具调用失败**
   - 模拟工具执行失败
   - 验证错误处理正确
   - 验证 state 同步

5. **非流式响应**
   - 使用非流式模型
   - 验证消息正确显示
   - 验证 state 同步

**验收标准**：
- ✅ 所有测试场景通过
- ✅ 无控制台错误或警告
- ✅ UI 更新流畅
- ✅ 与旧实现行为完全一致

---

## 收益分析

### 代码质量

| 指标 | 重构前 | 重构后 | 改进 |
|------|--------|--------|------|
| 手动同步次数 | 12 次 | 1 次（MessageManager 内部） | ↓ 92% |
| applyParseResult 行数 | 30 行 | 25 行 | ↓ 17% |
| applyNonStreamingResponse 行数 | 18 行 | 12 行 | ↓ 33% |
| handleToolCalls 行数 | 100 行 | 80 行 | ↓ 20% |
| 重复代码 | 高（12 次同步） | 低（封装） | ↓ 100% |

### 可维护性

- ✅ **单一职责**：MessageManager 只负责消息更新
- ✅ **易于修改**：修改同步逻辑只需改 1 个地方
- ✅ **易于扩展**：添加新的更新方法很方便
- ✅ **易于测试**：MessageManager 可独立测试

### 可靠性

- ✅ **消除遗漏**：原子更新保证不会遗漏同步
- ✅ **类型安全**：TypeScript 类型检查
- ✅ **减少 bug**：减少手动操作，降低出错概率

---

## 风险和缓解

### 风险 1: MessageManager 创建时机错误
**描述**：在错误的时机创建 MessageManager 实例

**缓解措施**：
- 在每个需要更新的函数内部创建（短期实例）
- 不要在类中缓存 MessageManager（context 会变化）

### 风险 2: 更新逻辑错误
**描述**：重构后更新逻辑与原逻辑不一致

**缓解措施**：
- 逐个函数重构，每步都运行集成测试
- 对比重构前后的行为
- 保留备份文件（streaming.ts.backup）

### 风险 3: 性能回退
**描述**：频繁创建 MessageManager 实例影响性能

**缓解措施**：
- MessageManager 是轻量级类（只有引用）
- 性能测试验证无显著差异

---

## 实施时间线

| 步骤 | 预计时间 | 累计时间 |
|------|---------|---------|
| Step 1: 创建 MessageManager | 30分钟 | 30分钟 |
| Step 2: 重构 applyParseResult | 20分钟 | 50分钟 |
| Step 3: 重构 applyNonStreamingResponse | 15分钟 | 1小时5分 |
| Step 4: 重构 handleToolCalls | 30分钟 | 1小时35分 |
| Step 5: 修复 finalize 依赖 | 15分钟 | 1小时50分 |
| Step 6: 集成测试和验证 | 30分钟 | 2小时20分 |

**总计**：约 2.5 小时

---

## 验收标准总结

### 功能完整性
- ✅ 所有消息更新场景正常工作
- ✅ 流式、非流式、工具调用、错误处理都正确
- ✅ 与旧实现行为 100% 一致

### 代码质量
- ✅ TypeScript 编译无错误
- ✅ 无 ESLint 警告
- ✅ 消除了 12 次手动同步
- ✅ 代码行数减少 ~20%

### 可维护性
- ✅ MessageManager 可独立测试
- ✅ 更新逻辑集中在一个类中
- ✅ 易于理解和修改

### 性能
- ✅ 无显著性能差异
- ✅ UI 更新流畅
- ✅ 无内存泄漏

---

## 总结

通过引入 MessageManager，我们将：

1. **消除状态同步混乱** - 从 12 次手动同步减少到 1 次原子更新
2. **提高代码质量** - 减少重复代码，提高可读性
3. **降低维护成本** - 修改同步逻辑只需改 1 个地方
4. **增强可靠性** - 原子更新保证不会遗漏同步

这是一个**低风险、高收益**的重构，预计 2.5 小时完成，值得立即开始执行。
