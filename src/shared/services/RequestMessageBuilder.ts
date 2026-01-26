/**
 * RequestMessageBuilder - 请求消息构建器
 * 负责将原始消息转换为可发送给 LLM 的最终消息列表
 *
 * 功能：
 * 1. 应用压缩策略
 * 2. 过滤无效消息
 * 3. 修复落单的 tool 消息
 * 4. 插入系统提示词
 * 5. 验证消息合法性
 */

class RequestMessageBuilder {
  private messages: MessageEntity[] = []
  private systemPrompts: string[] = []
  private compressionSummary: CompressedSummaryEntity | null = null
  private userInstruction: string | null = null

  /**
   * 设置原始消息列表
   */
  setMessages(messages: MessageEntity[]): this {
    this.messages = messages
    return this
  }

  /**
   * 设置系统提示词
   */
  setSystemPrompts(prompts: string[]): this {
    this.systemPrompts = prompts
    return this
  }

  /**
   * 设置用户指令（将作为 user 消息插入）
   */
  setUserInstruction(instruction?: string | null): this {
    const value = instruction?.trim()
    this.userInstruction = value ? value : null
    return this
  }

  /**
   * 设置压缩摘要
   */
  setCompressionSummary(summary: CompressedSummaryEntity | null): this {
    this.compressionSummary = summary
    return this
  }

  /**
   * 构建最终消息列表
   *
   * 流程：
   * 1. 应用压缩策略
   * 2. 过滤无效消息
   * 3. 修复落单的 tool 消息
   * 4. 插入系统提示词
   * 5. 验证消息合法性
   */
  build(): ChatMessage[] {
    // console.log('[RequestMessageBuilder] Starting message build pipeline')

    // Step 1: 应用压缩策略
    let messages = this.applyCompression()
    // console.log(`[RequestMessageBuilder] After compression: ${messages.length} messages`)

    // Step 2: 过滤无效消息
    messages = this.filterInvalidMessages(messages)
    // console.log(`[RequestMessageBuilder] After filtering: ${messages.length} messages`)

    // Step 3: 修复落单的 tool 消息
    messages = this.fixOrphanedToolMessages(messages)
    // console.log(`[RequestMessageBuilder] After orphaned tool fix: ${messages.length} messages`)

    // Step 3.5: 修复不匹配的 tool 调用/响应
    messages = this.repairToolCallPairs(messages)
    // console.log(`[RequestMessageBuilder] After tool call pairing: ${messages.length} messages`)

    // Step 4: 插入系统提示词
    messages = this.insertSystemPrompts(messages)
    // console.log(`[RequestMessageBuilder] After system prompts: ${messages.length} messages`)

    // Step 5: 验证消息合法性
    this.validateMessages(messages)

    return messages
  }

  // ========== 私有方法 ==========

  /**
   * 步骤 1: 应用压缩策略
   */
  private applyCompression(): ChatMessage[] {
    // 如果没有压缩摘要，直接返回原始消息
    if (!this.compressionSummary) {
      return this.messages.map(m => m.body)
    }

    // console.log('[RequestMessageBuilder] Applying compression strategy')

    // 创建被压缩的消息 ID 集合
    const compressedMessageIds = new Set<number>()
    this.compressionSummary.messageIds.forEach(id => compressedMessageIds.add(id))

    // 找到 startMessageId 的索引位置
    const startIndex = this.messages.findIndex(
      m => m.id === this.compressionSummary!.startMessageId
    )

    // 如果找不到 startMessageId，返回所有消息（降级处理）
    if (startIndex === -1) {
      console.warn('[RequestMessageBuilder] startMessageId not found, falling back to all messages')
      return this.messages.map(m => m.body)
    }

    // 从 startIndex 开始构建，抛弃之前的所有消息
    const result: ChatMessage[] = []

    // 先插入 summary（代表所有历史对话的总结）
    result.push(this.buildCompressedMessage(this.compressionSummary))

    // 然后添加 startMessageId 之后未被压缩的消息
    for (let i = startIndex; i < this.messages.length; i++) {
      const message = this.messages[i]
      const messageId = message.id

      // 跳过被压缩的消息
      if (messageId && compressedMessageIds.has(messageId)) {
        continue
      }

      result.push(message.body)
    }

    // console.log(`[RequestMessageBuilder] Compressed ${compressedMessageIds.size} messages into summary`)
    return result
  }

  /**
   * 构建压缩消息对象
   */
  private buildCompressedMessage(summary: CompressedSummaryEntity): ChatMessage {
    return {
      role: 'user',
      content: `[Previous conversation summary (${summary.messageIds.length} messages compressed)]\n\n${summary.summary}`,
      segments: []
    }
  }

  /**
   * 步骤 2: 过滤无效消息
   */
  private filterInvalidMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter(msg => {
      // 过滤空的 assistant 消息
      if (msg.role === 'assistant') {
        const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0
        const hasContent = msg.content &&
          (typeof msg.content === 'string' ? msg.content.trim() !== '' : true)

        if (!hasToolCalls && !hasContent) {
          // console.log('[RequestMessageBuilder] Filtering empty assistant message')
          return false
        }
      }

      return true
    })
  }

  /**
   * 步骤 3: 修复落单的 tool 消息
   */
  private fixOrphanedToolMessages(messages: ChatMessage[]): ChatMessage[] {
    // 收集所有 tool_use id
    const toolUseIds = this.collectToolUseIds(messages)

    // 过滤落单的 tool 消息
    return messages.filter(msg => {
      if (msg.role === 'tool') {
        const hasMatch = this.hasMatchingToolUse(msg, toolUseIds)
        if (!hasMatch) {
          // console.log('[RequestMessageBuilder] Removing orphaned tool message')
        }
        return hasMatch
      }
      return true
    })
  }

  /**
   * 步骤 3.5: 修复不匹配的 tool 调用/响应
   * - 若 assistant 的 toolCalls 数量与后续 tool 响应数量不一致，裁剪至匹配部分
   * - 避免发送不成对的 toolCalls，触发上游 API 报错
   */
  private repairToolCallPairs(messages: ChatMessage[]): ChatMessage[] {
    const repaired: ChatMessage[] = []

    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i]

      if (msg.role !== 'assistant' || !msg.toolCalls || msg.toolCalls.length === 0) {
        repaired.push(msg)
        continue
      }

      const toolCalls = msg.toolCalls
      const toolBatch: ChatMessage[] = []
      let j = i + 1
      while (j < messages.length && messages[j].role === 'tool') {
        toolBatch.push(messages[j])
        j += 1
      }

      if (toolBatch.length === toolCalls.length) {
        repaired.push(msg)
        repaired.push(...toolBatch)
        i = j - 1
        continue
      }

      const availableIds = new Set(toolBatch.map(tool => tool.toolCallId).filter(Boolean) as string[])
      const filteredCalls = toolCalls.filter(call => call.id && availableIds.has(call.id))
      const filteredIdSet = new Set(filteredCalls.map(call => call.id).filter(Boolean) as string[])
      const filteredTools = toolBatch.filter(tool => tool.toolCallId && filteredIdSet.has(tool.toolCallId))

      if (filteredCalls.length === 0) {
        const cleaned = { ...msg, toolCalls: undefined }
        repaired.push(cleaned)
      } else {
        repaired.push({ ...msg, toolCalls: filteredCalls })
        repaired.push(...filteredTools)
      }

      i = j - 1
    }

    return repaired
  }

  /**
   * 步骤 4: 插入系统提示词
   */
  private insertSystemPrompts(messages: ChatMessage[]): ChatMessage[] {
    if (this.systemPrompts.length === 0) {
      return messages
    }

    // 合并所有系统提示词
    const systemPrompt = this.systemPrompts.join('\n')

    // 插入到最前面
    const result: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
        segments: []
      },
      ...messages
    ]

    if (this.userInstruction) {
      result.splice(1, 0, {
        role: 'user',
        content: `<user_instruction>\n${this.userInstruction}\n</user_instruction>`,
        segments: []
      })
    }

    return result
  }

  /**
   * 步骤 5: 验证消息合法性
   */
  private validateMessages(messages: ChatMessage[]): void {
    // 验证 1: 至少有一条消息
    if (messages.length === 0) {
      throw new Error('[RequestMessageBuilder] Messages cannot be empty')
    }

    // 验证 2: 不能以 tool 消息开头
    if (messages[0].role === 'tool') {
      throw new Error('[RequestMessageBuilder] Messages cannot start with a tool message')
    }

    // 验证 3: tool 消息必须有对应的 tool_use
    const toolUseIds = this.collectToolUseIds(messages)
    for (const msg of messages) {
      if (msg.role === 'tool') {
        if (!this.hasMatchingToolUse(msg, toolUseIds)) {
          throw new Error('[RequestMessageBuilder] Found orphaned tool message after validation')
        }
      }
    }

    // console.log(`[RequestMessageBuilder] Validation passed: ${messages.length} messages`)
  }

  // ========== 辅助方法 ==========

  /**
   * 收集所有 tool_use id
   */
  private collectToolUseIds(messages: ChatMessage[]): Set<string> {
    const ids = new Set<string>()

    for (const msg of messages) {
      // Tool calls are stored in the toolCalls field, not in content
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        for (const toolCall of msg.toolCalls) {
          if (toolCall.id) {
            ids.add(toolCall.id)
          }
        }
      }
    }

    return ids
  }

  /**
   * 检查 tool 消息是否有对应的 tool_use
   */
  private hasMatchingToolUse(toolMessage: ChatMessage, toolUseIds: Set<string>): boolean {
    // Tool messages use toolCallId field to reference the tool call
    const toolCallId = toolMessage.toolCallId

    return toolCallId ? toolUseIds.has(toolCallId) : false
  }
}

export { RequestMessageBuilder }
