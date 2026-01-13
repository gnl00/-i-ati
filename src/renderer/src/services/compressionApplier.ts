/**
 * CompressionApplier - 压缩应用器
 *
 * 功能：
 * 1. 将压缩摘要应用到消息列表
 * 2. 用压缩消息替换被压缩的原始消息
 * 3. 保持消息顺序
 *
 * 优化策略：
 * - 每个 chat 只保留一条活跃摘要（最新的）
 * - 旧摘要会被标记为 superseded
 * - 新摘要基于旧摘要 + 新消息生成，避免内容冗余
 */

class CompressionApplier {
  /**
   * 应用压缩策略到消息列表
   * 注意：summaries 应该只包含 status='active' 的摘要
   */
  applyCompression(
    messages: MessageEntity[],
    summaries: CompressedSummaryEntity[]
  ): ChatMessage[] {
    // 1. 如果没有压缩摘要，直接返回原始消息
    if (summaries.length === 0) {
      return messages.map(m => m.body)
    }

    // 2. 获取最新的活跃摘要（理论上只有一条）
    const latestSummary = summaries[summaries.length - 1]

    // 3. 创建被压缩的消息 ID 集合
    const compressedMessageIds = new Set<number>()
    latestSummary.messageIds.forEach(id => compressedMessageIds.add(id))

    // 4. 找到 startMessageId 的索引位置
    const startIndex = messages.findIndex(m => m.id === latestSummary.startMessageId)

    // 5. 如果找不到 startMessageId，返回所有消息（降级处理）
    if (startIndex === -1) {
      console.warn('[CompressionApplier] startMessageId not found, falling back to all messages')
      return messages.map(m => m.body)
    }

    // 6. 从 startIndex 开始构建，抛弃之前的所有消息
    const result: ChatMessage[] = []

    // 先插入 summary（代表所有历史对话的总结）
    result.push(this.buildCompressedMessage(latestSummary))

    // 然后添加 startMessageId 之后未被压缩的消息
    for (let i = startIndex; i < messages.length; i++) {
      const message = messages[i]
      const messageId = message.id

      // 跳过被压缩的消息
      if (messageId && compressedMessageIds.has(messageId)) {
        continue
      }

      result.push(message.body)
    }

    return result
  }

  /**
   * 构建压缩消息对象
   */
  buildCompressedMessage(summary: CompressedSummaryEntity): ChatMessage {
    return {
      role: 'system',  // 使用 system 角色，对历史对话的总结
      content: `[Previous conversation summary (${summary.messageIds.length} messages compressed)]\n\n${summary.summary}`,
      segments: []
    }
  }
}

// 导出单例
export const compressionApplier = new CompressionApplier()
