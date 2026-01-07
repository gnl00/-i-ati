/**
 * Segment 工具函数
 *
 * 职责：
 * - 从 segments 中提取内容
 * - 检查 segments 是否有内容
 * - 提供便捷的内容访问方法
 */

/**
 * 从 segments 中提取所有文本内容
 */
export function extractContentFromSegments(
  segments: MessageSegment[] | undefined
): string {
  if (!segments || segments.length === 0) {
    return ''
  }

  return segments
    .filter(seg => seg.type === 'text')
    .map(seg => seg.content)
    .join('')
}

/**
 * 从 segments 中提取所有推理内容
 */
export function extractReasoningFromSegments(
  segments: MessageSegment[] | undefined
): string {
  if (!segments || segments.length === 0) {
    return ''
  }

  return segments
    .filter(seg => seg.type === 'reasoning')
    .map(seg => seg.content)
    .join('')
}

/**
 * 检查 segments 中是否有实际内容
 */
export function hasContentInSegments(
  segments: MessageSegment[] | undefined
): boolean {
  if (!segments || segments.length === 0) {
    return false
  }

  return segments.some(seg =>
    (seg.type === 'text' || seg.type === 'reasoning') &&
    seg.content &&
    seg.content.trim().length > 0
  )
}

/**
 * 从消息实体列表中获取最后一条消息的文本内容
 */
export function getLastMessageContent(
  messageEntities: MessageEntity[]
): string {
  if (messageEntities.length === 0) {
    return ''
  }

  const lastMessage = messageEntities[messageEntities.length - 1]
  return extractContentFromSegments(lastMessage.body.segments)
}

/**
 * 从消息实体列表中获取最后一条消息的推理内容
 */
export function getLastMessageReasoning(
  messageEntities: MessageEntity[]
): string {
  if (messageEntities.length === 0) {
    return ''
  }

  const lastMessage = messageEntities[messageEntities.length - 1]
  return extractReasoningFromSegments(lastMessage.body.segments)
}

/**
 * 检查消息实体列表的最后一条消息是否有内容
 */
export function lastMessageHasContent(
  messageEntities: MessageEntity[]
): boolean {
  if (messageEntities.length === 0) {
    return false
  }

  const lastMessage = messageEntities[messageEntities.length - 1]
  return hasContentInSegments(lastMessage.body.segments)
}
