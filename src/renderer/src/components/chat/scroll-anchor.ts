export type AnchorMode = 'latestMessage' | 'latestUserForAutoTop' | 'latestMinusOne'

function isAssistantPlaceholder(message?: MessageEntity): boolean {
  if (!message || message.body.role !== 'assistant') return false
  const body = message.body
  const contentEmpty = typeof body.content !== 'string' || body.content.trim().length === 0
  const noSegments = !Array.isArray(body.segments) || body.segments.length === 0
  const noToolCalls = !Array.isArray(body.toolCalls) || body.toolCalls.length === 0
  return contentEmpty && noSegments && noToolCalls
}

export function resolveAnchorIndex(messages: MessageEntity[], mode: AnchorMode): number {
  const latestIndex = messages.length - 1
  if (latestIndex < 0) return -1

  if (mode === 'latestMessage') {
    return latestIndex
  }

  if (mode === 'latestMinusOne') {
    return latestIndex > 0 ? latestIndex - 1 : latestIndex
  }

  const latest = messages[latestIndex]
  const previous = latestIndex > 0 ? messages[latestIndex - 1] : undefined
  if (isAssistantPlaceholder(latest) && previous?.body.role === 'user') {
    return latestIndex - 1
  }

  return latestIndex
}
