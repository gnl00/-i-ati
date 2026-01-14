# MessageBuilder 设计方案

**Breaking Change**不考虑兼容代码

## 一、设计目标

### 1. 统一职责
- 将分散在多个文件中的消息处理逻辑集中到一个类中
- 明确消息组装的每个步骤和顺序
- 提供清晰的 API 接口

### 2. 提高可维护性
- 每个步骤独立，易于测试
- 消息转换过程可追踪
- 易于扩展新的处理逻辑

### 3. 增强健壮性
- 验证消息的合法性
- 自动修复常见问题（如落单的 tool）
- 提供详细的日志和错误信息

---

## 二、类结构

```typescript
/**
 * MessageBuilder - 消息构建器
 * 负责将原始消息转换为可发送给 LLM 的最终消息列表
 */
class MessageBuilder {
  private messages: ChatMessage[] = []
  private systemPrompts: string[] = []
  private compressionSummary: CompressedSummaryEntity | null = null

  /**
   * 设置系统提示词
   */
  setSystemPrompts(prompts: string[]): this

  /**
   * 设置原始消息列表
   */
  setMessages(messages: MessageEntity[]): this

  /**
   * 设置压缩摘要
   */
  setCompressionSummary(summary: CompressedSummaryEntity | null): this

  /**
   * 构建最终消息列表
   */
  build(): ChatMessage[]

  // ========== 私有方法 ==========

  /**
   * 步骤 1: 应用压缩策略
   */
  private applyCompression(): ChatMessage[]

  /**
   * 步骤 2: 过滤无效消息
   */
  private filterInvalidMessages(messages: ChatMessage[]): ChatMessage[]

  /**
   * 步骤 3: 修复落单的 tool 消息
   */
  private fixOrphanedToolMessages(messages: ChatMessage[]): ChatMessage[]

  /**
   * 步骤 4: 插入系统提示词
   */
  private insertSystemPrompts(messages: ChatMessage[]): ChatMessage[]

  /**
   * 步骤 5: 验证消息合法性
   */
  private validateMessages(messages: ChatMessage[]): void

  /**
   * 辅助方法: 收集所有 tool_use id
   */
  private collectToolUseIds(messages: ChatMessage[]): Set<string>

  /**
   * 辅助方法: 检查 tool 消息是否有对应的 tool_use
   */
  private hasMatchingToolUse(toolMessage: ChatMessage, toolUseIds: Set<string>): boolean
}
```

---

## 三、构建流程

### 流程图

```
原始消息 + 系统提示词 + 压缩摘要
           ↓
    [1] 应用压缩策略
           ↓
    [2] 过滤无效消息
           ↓
    [3] 修复落单 tool
           ↓
    [4] 插入系统提示词
           ↓
    [5] 验证消息合法性
           ↓
      最终消息列表
```

### 详细步骤

#### 步骤 1: 应用压缩策略

```typescript
private applyCompression(): ChatMessage[] {
  // 如果没有压缩摘要，直接返回原始消息
  if (!this.compressionSummary) {
    return this.messages.map(m => m.body)
  }

  // 创建被压缩的消息 ID 集合
  const compressedIds = new Set(this.compressionSummary.messageIds)

  // 找到压缩的起始位置
  const startIndex = this.messages.findIndex(
    m => m.id === this.compressionSummary!.startMessageId
  )

  if (startIndex === -1) {
    console.warn('[MessageBuilder] startMessageId not found, using all messages')
    return this.messages.map(m => m.body)
  }

  // 构建结果
  const result: ChatMessage[] = []

  // 插入压缩摘要
  result.push({
    role: 'system',
    content: `[Previous conversation summary (${this.compressionSummary.messageIds.length} messages compressed)]\n\n${this.compressionSummary.summary}`,
    segments: []
  })

  // 添加未被压缩的消息
  for (let i = startIndex; i < this.messages.length; i++) {
    const message = this.messages[i]
    if (message.id && !compressedIds.has(message.id)) {
      result.push(message.body)
    }
  }

  return result
}
```

#### 步骤 2: 过滤无效消息

```typescript
private filterInvalidMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(msg => {
    // 过滤空的 assistant 消息
    if (msg.role === 'assistant') {
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0
      const hasContent = msg.content &&
        (typeof msg.content === 'string' ? msg.content.trim() !== '' : true)

      if (!hasToolCalls && !hasContent) {
        console.log('[MessageBuilder] Filtering empty assistant message')
        return false
      }
    }

    return true
  })
}
```

#### 步骤 3: 修复落单的 tool 消息

```typescript
private fixOrphanedToolMessages(messages: ChatMessage[]): ChatMessage[] {
  // 收集所有 tool_use id
  const toolUseIds = this.collectToolUseIds(messages)

  // 过滤落单的 tool 消息
  return messages.filter(msg => {
    if (msg.role === 'tool') {
      const hasMatch = this.hasMatchingToolUse(msg, toolUseIds)
      if (!hasMatch) {
        console.log('[MessageBuilder] Removing orphaned tool message')
      }
      return hasMatch
    }
    return true
  })
}

private collectToolUseIds(messages: ChatMessage[]): Set<string> {
  const ids = new Set<string>()

  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && block.id) {
          ids.add(block.id)
        }
      }
    }
  }

  return ids
}

private hasMatchingToolUse(toolMessage: ChatMessage, toolUseIds: Set<string>): boolean {
  const toolUseId = Array.isArray(toolMessage.content)
    ? toolMessage.content[0]?.tool_use_id
    : (toolMessage.content as any)?.tool_use_id

  return toolUseId ? toolUseIds.has(toolUseId) : false
}
```

#### 步骤 4: 插入系统提示词

```typescript
private insertSystemPrompts(messages: ChatMessage[]): ChatMessage[] {
  if (this.systemPrompts.length === 0) {
    return messages
  }

  // 合并所有系统提示词
  const systemPrompt = this.systemPrompts.join('\n')

  // 插入到最前面
  return [
    {
      role: 'system',
      content: systemPrompt,
      segments: []
    },
    ...messages
  ]
}
```

#### 步骤 5: 验证消息合法性

```typescript
private validateMessages(messages: ChatMessage[]): void {
  // 验证 1: 不能以 tool 消息开头
  if (messages.length > 0 && messages[0].role === 'tool') {
    throw new Error('[MessageBuilder] Messages cannot start with a tool message')
  }

  // 验证 2: tool 消息必须有对应的 tool_use
  const toolUseIds = this.collectToolUseIds(messages)
  for (const msg of messages) {
    if (msg.role === 'tool') {
      if (!this.hasMatchingToolUse(msg, toolUseIds)) {
        throw new Error('[MessageBuilder] Found orphaned tool message after validation')
      }
    }
  }

  // 验证 3: 至少有一条消息
  if (messages.length === 0) {
    throw new Error('[MessageBuilder] Messages cannot be empty')
  }

  console.log(`[MessageBuilder] Validation passed: ${messages.length} messages`)
}
```

---

## 四、使用示例

```typescript
// 在 request.ts 中使用
const messageBuilder = new MessageBuilder()
  .setSystemPrompts(prepared.systemPrompts)
  .setMessages(prepared.session.messageEntities)
  .setCompressionSummary(summaries.length > 0 ? summaries[0] : null)

const finalMessages = messageBuilder.build()

const request: IUnifiedRequest = {
  baseUrl: prepared.meta.provider.apiUrl,
  messages: finalMessages,
  apiKey: prepared.meta.provider.apiKey,
  prompt: '',  // 不再需要，已经在 MessageBuilder 中处理
  model: prepared.meta.model.value,
  modelType: prepared.meta.model.type,
  tools: finalTools
}
```

---

## 五、优势

### 1. 职责清晰
- 所有消息处理逻辑集中在一个类中
- 每个步骤独立，易于理解和维护

### 2. 易于测试
```typescript
describe('MessageBuilder', () => {
  it('should remove orphaned tool messages', () => {
    const builder = new MessageBuilder()
      .setMessages([
        { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1' }] },
        { role: 'tool', content: [{ tool_use_id: 'call_1' }] },
        { role: 'tool', content: [{ tool_use_id: 'call_2' }] }  // 落单
      ])

    const result = builder.build()
    expect(result.filter(m => m.role === 'tool')).toHaveLength(1)
  })
})
```

### 3. 可扩展
- 添加新的处理步骤只需添加新方法
- 不影响现有逻辑

### 4. 可追踪
- 每个步骤都有日志输出
- 易于调试和排查问题

---

## 六、迁移计划

### 阶段 1: 创建 MessageBuilder
- 实现基础类结构
- 迁移现有逻辑
- 添加单元测试

### 阶段 2: 集成到 request.ts
- 替换现有的消息处理逻辑
- 保持向后兼容

### 阶段 3: 简化 Adapter
- 移除 adapter 中的消息插入逻辑
- adapter 只负责格式转换

### 阶段 4: 清理旧代码
- 删除 compressionApplier.ts 中的重复逻辑
- 统一消息处理入口
