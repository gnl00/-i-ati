export function extractAssistantRegeneratePayload(
  message: ChatMessage
): { text: string; images: ClipbordImg[] } | null {
  if (typeof message.content === 'string') {
    const text = message.content.trim()
    return text ? { text, images: [] } : null
  }

  if (!Array.isArray(message.content)) {
    return null
  }

  const textParts: string[] = []
  const images: ClipbordImg[] = []
  for (const item of message.content) {
    if (item.type === 'text' && item.text) {
      textParts.push(item.text)
    }
    if (item.type === 'image_url' && item.image_url?.url) {
      images.push(item.image_url.url)
    }
  }

  const text = textParts.join('\n').trim()
  if (!text && images.length === 0) {
    return null
  }

  return { text, images }
}

export function getAssistantCopyContent(message: ChatMessage): string {
  const segmentText = (message.segments || [])
    .filter((segment): segment is TextSegment => segment.type === 'text')
    .map(segment => segment.content)
    .join('')
    .trim()

  if (segmentText) {
    return segmentText
  }

  if (typeof message.content === 'string') {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((item): item is VLMContent & { text: string } => item.type === 'text' && typeof item.text === 'string')
      .map(item => item.text)
      .join('\n')
      .trim()
  }

  return ''
}

export function findLatestRegeneratableUserMessage(messages: MessageEntity[]): ChatMessage | null {
  return [...messages]
    .reverse()
    .find(item => item.body.role === 'user' && !item.body.source)
    ?.body ?? null
}
