import type { TelegramInboundEnvelope } from './types'

export const buildTelegramInputText = (
  envelope: TelegramInboundEnvelope,
  attachmentTextBlocks: string[] = []
): string => {
  const parts = [envelope.text.trim()].filter(Boolean)

  if (parts.length === 0 && envelope.media.length > 0) {
    const imageCount = envelope.media.filter((media) =>
      media.kind === 'photo' || media.mimeType?.startsWith('image/')
    ).length
    const documentCount = envelope.media.length - imageCount

    if (imageCount > 1) {
      parts.push('Please analyze the attached images.')
    } else if (imageCount === 1) {
      parts.push('Please analyze the attached image.')
    }

    if (documentCount > 1) {
      parts.push('Please review the attached documents.')
    } else if (documentCount === 1) {
      parts.push('Please review the attached document.')
    }
  }

  if (attachmentTextBlocks.length > 0) {
    parts.push(...attachmentTextBlocks)
  }

  return parts.join('\n\n').trim()
}
