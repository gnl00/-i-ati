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

export function extractSearchableMessageText(
  message: Pick<ChatMessage, 'content' | 'segments'>
): string {
  const fromSegments = extractContentFromSegments(message.segments)
  if (fromSegments.trim().length > 0) {
    return fromSegments
  }

  if (typeof message.content === 'string') {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((item): item is VLMContent & { text: string } => item.type === 'text' && typeof item.text === 'string')
      .map(item => item.text)
      .join(' ')
  }

  return ''
}

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

export function hasContentInSegments(
  segments: MessageSegment[] | undefined
): boolean {
  if (!segments || segments.length === 0) {
    return false
  }

  return segments.some(seg =>
    (seg.type === 'text' || seg.type === 'reasoning')
    && seg.content
    && seg.content.trim().length > 0
  )
}
