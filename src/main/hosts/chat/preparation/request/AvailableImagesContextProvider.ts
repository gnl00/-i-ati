import { HIDDEN_MESSAGE_SOURCES, MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { escapeXmlAttribute } from '@shared/utils/xml'

const MAX_AVAILABLE_IMAGE_TEXT_LENGTH = 240

const isImagePart = (part: VLMContent): part is VLMContent & { image_url: VLMImgContent } => (
  part.type === 'image_url' && Boolean(part.image_url?.url)
)

const extractUserText = (content: string | VLMContent[]): string => {
  if (typeof content === 'string') {
    return content.trim()
  }

  return content
    .flatMap((part) => (
      part.type === 'text' && typeof part.text === 'string'
        ? [part.text.trim()]
        : []
    ))
    .filter(Boolean)
    .join('\n')
    .trim()
}

const truncateContextText = (value: string): string => {
  if (value.length <= MAX_AVAILABLE_IMAGE_TEXT_LENGTH) {
    return value
  }

  return `${value.slice(0, MAX_AVAILABLE_IMAGE_TEXT_LENGTH - 3)}...`
}

export class AvailableImagesContextProvider {
  build(
    messages: MessageEntity[],
    compressionSummary: CompressedSummaryEntity | null
  ): ChatMessage | null {
    const window = this.resolveUncompressedWindow(messages, compressionSummary)
    const lines = this.buildImageLines(window)
    if (lines.length === 0) {
      return null
    }

    return {
      role: 'user',
      source: MESSAGE_SOURCE.AVAILABLE_IMAGES_CONTEXT,
      content: [
        '<available_images>',
        'Use these refs with vision_analyze when the user asks to inspect a current or historical image. The raw image data stays outside the MainAgent request.',
        ...lines,
        '</available_images>'
      ].join('\n'),
      segments: []
    }
  }

  private resolveUncompressedWindow(
    messages: MessageEntity[],
    compressionSummary: CompressedSummaryEntity | null
  ): MessageEntity[] {
    if (!compressionSummary) {
      return [...messages]
    }

    const startIndex = messages.findIndex(message => message.id === compressionSummary.startMessageId)
    if (startIndex === -1) {
      return [...messages]
    }

    const compressedMessageIds = new Set(compressionSummary.messageIds)
    const result: MessageEntity[] = []
    for (let index = startIndex; index < messages.length; index += 1) {
      const message = messages[index]
      if (message.id != null && compressedMessageIds.has(message.id)) {
        continue
      }
      result.push(message)
    }

    return result
  }

  private buildImageLines(messages: MessageEntity[]): string[] {
    const lines: string[] = []

    for (const message of messages) {
      if (
        message.id == null
        || message.body.role !== 'user'
        || (message.body.source ? HIDDEN_MESSAGE_SOURCES.has(message.body.source) : false)
        || !Array.isArray(message.body.content)
      ) {
        continue
      }

      const imageParts = message.body.content.filter(isImagePart)
      if (imageParts.length === 0) {
        continue
      }

      const userText = truncateContextText(extractUserText(message.body.content))
      imageParts.forEach((_part, index) => {
        const ordinal = index + 1
        const attrs = [
          `ref="message:${message.id}#image:${ordinal}"`,
          `message_ref="message:${message.id}"`,
          `image_index="${ordinal}"`
        ]
        if (userText) {
          attrs.push(`user_text="${escapeXmlAttribute(userText)}"`)
        }
        lines.push(`  <image ${attrs.join(' ')} />`)
      })
    }

    return lines
  }
}
