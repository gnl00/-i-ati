import type { Context } from 'grammy'
import type {
  TelegramInboundEnvelope,
  TelegramInboundMedia,
  TelegramPeerType
} from '@main/hosts/telegram'

function normalizePeerType(value?: string): TelegramPeerType {
  if (value === 'private' || value === 'group' || value === 'supergroup' || value === 'channel') {
    return value
  }
  return 'private'
}

function extractDisplayName(ctx: Context): string | undefined {
  const from = ctx.message?.from
  const chat = ctx.message?.chat
  const displayName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim()

  return displayName || chat?.title || from?.username || chat?.username || undefined
}

function extractMentionedUsername(text: string, offset: number, length: number): string {
  return text.slice(offset, offset + length).trim().replace(/^@/, '').toLowerCase()
}

function extractMedia(ctx: Context): TelegramInboundMedia[] {
  const message = ctx.message
  if (!message) {
    return []
  }

  const media: TelegramInboundMedia[] = []
  const photos = message.photo
  if (photos?.length) {
    const largestPhoto = photos[photos.length - 1]
    media.push({
      kind: 'photo',
      fileId: largestPhoto.file_id,
      fileUniqueId: largestPhoto.file_unique_id,
      fileSize: largestPhoto.file_size,
      width: largestPhoto.width,
      height: largestPhoto.height
    })
  }

  if (message.document) {
    media.push({
      kind: 'document',
      fileId: message.document.file_id,
      fileUniqueId: message.document.file_unique_id,
      fileName: message.document.file_name,
      mimeType: message.document.mime_type,
      fileSize: message.document.file_size
    })
  }

  return media
}

export class TelegramUpdateMapper {
  static fromContext(ctx: Context, botUsername?: string): TelegramInboundEnvelope | null {
    const message = ctx.message
    if (!message) {
      return null
    }

    const media = extractMedia(ctx)
    const text = (message.text ?? message.caption ?? '').trim()
    if (!text && media.length === 0) {
      return null
    }

    const entities = message.text ? (message.entities ?? []) : (message.caption_entities ?? [])
    const normalizedBotUsername = botUsername?.replace(/^@/, '').toLowerCase()
    const isMentioned = entities.some((entity) => {
      if (entity.type !== 'mention' || !normalizedBotUsername) {
        return false
      }
      return extractMentionedUsername(text, entity.offset, entity.length) === normalizedBotUsername
    })

    return {
      updateId: ctx.update.update_id,
      messageId: String(message.message_id),
      chatId: String(message.chat.id),
      chatType: normalizePeerType(message.chat.type),
      threadId: message.message_thread_id ? String(message.message_thread_id) : undefined,
      fromUserId: message.from?.id ? String(message.from.id) : undefined,
      username: message.from?.username ?? message.chat.username,
      displayName: extractDisplayName(ctx),
      text,
      media,
      isMentioned,
      replyToBot: Boolean(message.reply_to_message?.from?.is_bot),
      receivedAt: Date.now()
    }
  }
}
