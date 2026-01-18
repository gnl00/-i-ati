# 消息构建与压缩流程

## 概述

本文档描述了消息从准备、构建、压缩到最终发送给 LLM 的完整流程。

**核心组件：** `RequestMessageBuilder` - 统一的消息构建器，负责将原始消息转换为可发送给 LLM 的最终消息列表。

---

## 消息处理流程

### 整体流程图

```
prepare.ts
  ↓ 准备消息实体和系统提示词
request.ts
  ↓ 获取压缩摘要（如果启用）
RequestMessageBuilder
  ├─ [1] 应用压缩策略
  ├─ [2] 过滤无效消息
  ├─ [3] 修复落单的 tool 消息
  ├─ [4] 插入系统提示词
  └─ [5] 验证消息合法性
  ↓ 返回最终消息列表
Adapter (OpenAI/Claude)
  ↓ 转换为 API 格式
LLM API
```

---

## 详细步骤

### 步骤 1: 消息准备

**文件：** `src/renderer/src/hooks/chatSubmit/prepare.ts`

**功能：** 准备系统提示词和消息实体

```typescript
// 准备 system prompts
const systemPrompts = prompt
  ? [prompt, defaultSystemPrompt]
  : [defaultSystemPrompt]

// 准备消息列表
const messageEntities = [
  ...existingMessages,
  userMessageEntity,
  initialAssistantMessage
]
```

**输出：**
- `systemPrompts: string[]` - 系统提示词数组
- `messageEntities: MessageEntity[]` - 完整消息实体（包含 id，用于压缩）

---

### 步骤 2: 获取压缩摘要

**文件：** `src/renderer/src/hooks/chatSubmit/request.ts`

**功能：** 如果启用压缩，获取活跃的压缩摘要

```typescript
let compressionSummary: CompressedSummaryEntity | null = null
if (compressionConfig?.enabled && prepared.session.currChatId) {
  const summaries = await getActiveCompressedSummariesByChatId(
    prepared.session.currChatId
  )
  compressionSummary = summaries.length > 0 ? summaries[0] : null
}
```

---

### 步骤 3: RequestMessageBuilder 构建消息

**文件：** `src/renderer/src/services/RequestMessageBuilder.ts`

**功能：** 统一的消息构建器，执行 5 步处理流程

```typescript
const messageBuilder = new RequestMessageBuilder()
  .setSystemPrompts(prepared.systemPrompts)
  .setMessages(prepared.session.messageEntities)
  .setCompressionSummary(compressionSummary)

const finalMessages = messageBuilder.build()
```

#### RequestMessageBuilder 内部流程

**[1] 应用压缩策略**

```typescript
private applyCompression(): ChatMessage[] {
  // 如果没有压缩摘要，直接返回原始消息
  if (!this.compressionSummary) {
    return this.messages.map(m => m.body)
  }

  // 创建被压缩的消息 ID 集合
  const compressedMessageIds = new Set(this.compressionSummary.messageIds)

  // 找到 startMessageId 的索引位置
  const startIndex = this.messages.findIndex(
    m => m.id === this.compressionSummary!.startMessageId
  )

  // 构建结果：插入压缩摘要 + 未被压缩的消息
  const result = [
    this.buildCompressedMessage(this.compressionSummary),
    ...未被压缩的消息
  ]

  return result
}
```

**压缩前后对比：**

```
压缩前：
user → assistant (toolCalls) → tool (toolCallId) → assistant → user → ...

压缩后：
system (summary) → assistant → user → ...
```

---

**[2] 过滤无效消息**

```typescript
private filterInvalidMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(msg => {
    if (msg.role === 'assistant') {
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0
      const hasContent = msg.content && msg.content.trim() !== ''
      return hasToolCalls || hasContent  // 过滤空的 assistant 消息
    }
    return true
  })
}
```

---

**[3] 修复落单的 tool 消息**

```typescript
private fixOrphanedToolMessages(messages: ChatMessage[]): ChatMessage[] {
  // 收集所有 tool_use id（从 assistant 消息的 toolCalls 字段）
  const toolUseIds = this.collectToolUseIds(messages)

  // 过滤落单的 tool 消息
  return messages.filter(msg => {
    if (msg.role === 'tool') {
      // 检查 tool 消息的 toolCallId 是否在 toolUseIds 中
      return this.hasMatchingToolUse(msg, toolUseIds)
    }
    return true
  })
}
```

**关键点：**
- Tool calls 存储在 `msg.toolCalls` 字段（IToolCall[]）
- Tool 消息使用 `msg.toolCallId` 字段引用对应的 tool call
- 比旧的位置检查方法更健壮

---

**[4] 插入系统提示词**

```typescript
private insertSystemPrompts(messages: ChatMessage[]): ChatMessage[] {
  if (this.systemPrompts.length === 0) {
    return messages
  }

  // 合并所有系统提示词，插入到最前面
  return [
    {
      role: 'system',
      content: this.systemPrompts.join('\n'),
      segments: []
    },
    ...messages
  ]
}
```

**结果：**
```
system (prompt) → system (summary) → assistant → user → ...
     ↑ 新插入
```

---

**[5] 验证消息合法性**

```typescript
private validateMessages(messages: ChatMessage[]): void {
  // 验证 1: 至少有一条消息
  if (messages.length === 0) {
    throw new Error('Messages cannot be empty')
  }

  // 验证 2: 不能以 tool 消息开头
  if (messages[0].role === 'tool') {
    throw new Error('Messages cannot start with a tool message')
  }

  // 验证 3: tool 消息必须有对应的 tool_use
  const toolUseIds = this.collectToolUseIds(messages)
  for (const msg of messages) {
    if (msg.role === 'tool' && !this.hasMatchingToolUse(msg, toolUseIds)) {
      throw new Error('Found orphaned tool message after validation')
    }
  }
}
```

---

### 步骤 4: Adapter 转换

**OpenAI Adapter** (`src/main/request/adapters/openai.ts`)

```typescript
transformRequest(req: IUnifiedRequest): any {
  const requestBody = {
    model: req.model,
    messages: req.messages,  // 直接使用，系统提示词已包含
    stream: req.stream ?? true,
    // ...
  }

  if (req.tools?.length) {
    requestBody.tools = this.transformTools(req.tools)
  }

  return requestBody
}
```

**Claude Adapter** (`src/main/request/adapters/claude.ts`)

Claude Messages API 需要特殊处理：系统提示词必须放在单独的 `system` 字段中。

```typescript
transformRequest(req: IUnifiedRequest): any {
  // 从消息中提取系统消息
  const { systemPrompt, messages } = this.extractSystemMessages(req.messages)

  const requestBody = {
    model: req.model,
    messages: messages,  // 不包含 system 消息
    // ...
  }

  // 系统提示词放在单独的 system 字段
  if (systemPrompt) {
    requestBody.system = systemPrompt
  }

  return requestBody
}
```

---

## 关键文件

| 文件 | 作用 |
|------|------|
| `src/renderer/src/hooks/chatSubmit/prepare.ts` | 消息准备 |
| `src/renderer/src/hooks/chatSubmit/request.ts` | 获取压缩摘要，调用 RequestMessageBuilder |
| `src/renderer/src/services/RequestMessageBuilder.ts` | **核心**：统一的消息构建器 |
| `src/main/services/compressionService.ts` | 压缩策略分析、摘要生成（主线程执行） |
| `src/main/request/adapters/openai.ts` | OpenAI adapter 转换 |
| `src/main/request/adapters/claude.ts` | Claude adapter 转换（特殊处理 system 字段） |

---

## 消息类型结构

### MessageEntity vs ChatMessage

```typescript
// MessageEntity - 数据库实体（包含 id）
interface MessageEntity {
  id?: number
  chatId?: number
  body: ChatMessage  // 实际消息内容
  tokens?: number
}

// ChatMessage - 消息体
interface ChatMessage {
  role: string
  content: string | VLMContent[]
  toolCalls?: IToolCall[]  // Tool 调用列表
  toolCallId?: string      // Tool 消息引用的 tool call id
  segments: MessageSegment[]  // 必需字段
}

// IToolCall - Tool 调用
interface IToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}
```

### Tool 消息配对机制

```typescript
// Assistant 消息（发起 tool call）
{
  role: 'assistant',
  toolCalls: [
    { id: 'call_123', type: 'function', function: { name: 'execute_command', ... } }
  ]
}

// Tool 消息（返回结果）
{
  role: 'tool',
  toolCallId: 'call_123',  // 引用上面的 id
  content: '命令执行结果'
}
```

**RequestMessageBuilder 验证逻辑：**
1. 收集所有 `assistant.toolCalls[].id`
2. 检查每个 `tool.toolCallId` 是否在收集的 id 集合中
3. 移除没有匹配的 tool 消息（落单的 tool）

---

## 完整示例

### 场景：带压缩和 Tool 调用的消息流

**输入（MessageEntity[]）：**
```typescript
[
  { id: 1, body: { role: 'user', content: '执行命令 ls' } },
  { id: 2, body: { role: 'assistant', toolCalls: [{ id: 'call_1', ... }] } },  // 被压缩
  { id: 3, body: { role: 'tool', toolCallId: 'call_1', content: '...' } },     // 被压缩
  { id: 4, body: { role: 'assistant', content: '命令执行完成' } },              // 被压缩
  { id: 5, body: { role: 'user', content: '再执行 pwd' } },
  { id: 6, body: { role: 'assistant', toolCalls: [{ id: 'call_2', ... }] } },
  { id: 7, body: { role: 'tool', toolCallId: 'call_2', content: '...' } },
  { id: 8, body: { role: 'assistant', content: '' } }  // 空消息
]
```

**压缩摘要：**
```typescript
{
  messageIds: [1, 2, 3, 4],
  startMessageId: 1,
  summary: '用户执行了 ls 命令，查看了目录内容'
}
```

**RequestMessageBuilder 处理流程：**

**[1] 应用压缩后：**
```typescript
[
  { role: 'system', content: '[Previous conversation summary...]\n\n用户执行了 ls 命令...' },
  { role: 'user', content: '再执行 pwd' },
  { role: 'assistant', toolCalls: [{ id: 'call_2', ... }] },
  { role: 'tool', toolCallId: 'call_2', content: '...' },
  { role: 'assistant', content: '' }
]
```

**[2] 过滤无效消息后：**
```typescript
[
  { role: 'system', content: '[Previous conversation summary...]...' },
  { role: 'user', content: '再执行 pwd' },
  { role: 'assistant', toolCalls: [{ id: 'call_2', ... }] },
  { role: 'tool', toolCallId: 'call_2', content: '...' }
  // 空的 assistant 消息被过滤
]
```

**[3] 修复落单 tool 后：**
```typescript
// 无变化，因为 call_2 存在于 assistant.toolCalls 中
[
  { role: 'system', content: '[Previous conversation summary...]...' },
  { role: 'user', content: '再执行 pwd' },
  { role: 'assistant', toolCalls: [{ id: 'call_2', ... }] },
  { role: 'tool', toolCallId: 'call_2', content: '...' }
]
```

**[4] 插入系统提示词后：**
```typescript
[
  { role: 'system', content: 'You are a helpful assistant...' },  // ← 新插入
  { role: 'system', content: '[Previous conversation summary...]...' },
  { role: 'user', content: '再执行 pwd' },
  { role: 'assistant', toolCalls: [{ id: 'call_2', ... }] },
  { role: 'tool', toolCallId: 'call_2', content: '...' }
]
```

**[5] 验证通过 ✅**

---

## 总结

### 核心改进

1. **统一入口**：`RequestMessageBuilder` 统一处理所有消息构建逻辑
2. **健壮验证**：使用 `toolCalls` 和 `toolCallId` 字段进行 tool 消息配对验证
3. **清晰流程**：5 步处理流程，每步职责明确
4. **适配器简化**：Adapter 只负责格式转换，不再处理消息插入

### 关键要点

- **MessageEntity** 用于数据库存储（包含 id）
- **ChatMessage** 用于 API 请求（消息体）
- **Tool 配对**：`assistant.toolCalls[].id` ↔ `tool.toolCallId`
- **压缩策略**：用摘要替换历史消息，减少 token 使用
- **系统提示词**：统一在 RequestMessageBuilder 中插入

### 调试日志

RequestMessageBuilder 在每个步骤都会输出日志：

```
[RequestMessageBuilder] Starting message build pipeline
[RequestMessageBuilder] After compression: X messages
[RequestMessageBuilder] After filtering: X messages
[RequestMessageBuilder] After orphaned tool fix: X messages
[RequestMessageBuilder] After system prompts: X messages
[RequestMessageBuilder] Validation passed: X messages
```

---

## 相关文档

- `docs/message-builder-design.md` - RequestMessageBuilder 设计方案
