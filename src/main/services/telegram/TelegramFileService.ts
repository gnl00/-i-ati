import { Bot } from 'grammy'
import { lookup as lookupMimeType } from 'mime-types'
import { createLogger } from '@main/services/logging/LogService'
import type { TelegramInboundEnvelope, TelegramInboundMedia } from '@main/services/hostAdapters/telegram'

const MAX_INLINE_FILE_SIZE = 10 * 1024 * 1024
const MAX_INLINE_TEXT_FILE_SIZE = 32 * 1024
const MAX_INLINE_TEXT_LENGTH = 10_000
const TEXT_DOCUMENT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'text/xml'
])

export type TelegramAttachmentContext = {
  mediaCtx: string[]
  documentTextBlocks: string[]
}

export class TelegramFileService {
  private readonly logger = createLogger('TelegramFileService')

  async buildAttachmentContext(bot: Bot, envelope: TelegramInboundEnvelope): Promise<TelegramAttachmentContext> {
    const mediaCtx: string[] = []
    const documentTextBlocks: string[] = []

    for (const media of envelope.media) {
      try {
        const file = await bot.api.getFile(media.fileId)
        if (!file.file_path) {
          continue
        }

        const response = await fetch(`https://api.telegram.org/file/bot${bot.token}/${file.file_path}`)
        if (!response.ok) {
          throw new Error(`Failed to download telegram file: ${response.status}`)
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        const mimeType = this.resolveMimeType(media, response.headers.get('content-type'))

        this.logger.info('download.completed', {
          kind: media.kind,
          fileId: media.fileId,
          bytes: buffer.length,
          mimeType
        })

        if (this.shouldInlineAsImage(media, mimeType, buffer.length)) {
          mediaCtx.push(this.toDataUrl(buffer, mimeType))
        }

        const textBlock = this.tryExtractSmallTextDocument(media, mimeType, buffer)
        if (textBlock) {
          documentTextBlocks.push(textBlock)
        }
      } catch (error) {
        this.logger.warn('download.failed', {
          chatId: envelope.chatId,
          messageId: envelope.messageId,
          kind: media.kind,
          fileId: media.fileId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return {
      mediaCtx,
      documentTextBlocks
    }
  }

  private resolveMimeType(media: TelegramInboundMedia, responseContentType?: string | null): string {
    const normalizedMediaMimeType = this.normalizeMimeType(media.mimeType)
    if (normalizedMediaMimeType) {
      return normalizedMediaMimeType
    }

    const normalizedResponseMimeType = this.normalizeMimeType(responseContentType)
    if (normalizedResponseMimeType && normalizedResponseMimeType !== 'application/octet-stream') {
      return normalizedResponseMimeType
    }

    const inferredMimeType = this.inferMimeTypeFromFileName(media.fileName)
    if (inferredMimeType) {
      return inferredMimeType
    }

    if (media.kind === 'photo') {
      return 'image/jpeg'
    }

    return normalizedResponseMimeType || 'application/octet-stream'
  }

  private normalizeMimeType(value?: string | null): string | null {
    if (!value) {
      return null
    }

    const normalized = value.split(';', 1)[0]?.trim().toLowerCase()
    return normalized || null
  }

  private inferMimeTypeFromFileName(fileName?: string): string | null {
    if (!fileName) {
      return null
    }

    const mimeType = lookupMimeType(fileName)
    return typeof mimeType === 'string' ? mimeType.toLowerCase() : null
  }

  private shouldInlineAsImage(media: TelegramInboundMedia, mimeType: string, bytes: number): boolean {
    if (bytes > MAX_INLINE_FILE_SIZE) {
      return false
    }

    if (media.kind === 'photo') {
      return true
    }

    return mimeType.startsWith('image/')
  }

  private tryExtractSmallTextDocument(
    media: TelegramInboundMedia,
    mimeType: string,
    buffer: Buffer
  ): string | null {
    if (media.kind !== 'document') {
      return null
    }

    if (buffer.length > MAX_INLINE_TEXT_FILE_SIZE) {
      return null
    }

    if (!TEXT_DOCUMENT_MIME_TYPES.has(mimeType)) {
      return null
    }

    const decoded = buffer.toString('utf8')
    if (!this.isMostlyReadableText(decoded)) {
      return null
    }

    const trimmed = decoded.trim()
    if (!trimmed) {
      return null
    }

    const limitedText = trimmed.length > MAX_INLINE_TEXT_LENGTH
      ? `${trimmed.slice(0, MAX_INLINE_TEXT_LENGTH)}\n\n[Document content truncated]`
      : trimmed

    const label = media.fileName || 'telegram-document'
    return `Attached document: ${label}\n\n--- BEGIN TELEGRAM DOCUMENT ---\n${limitedText}\n--- END TELEGRAM DOCUMENT ---`
  }

  private isMostlyReadableText(value: string): boolean {
    if (value.includes('\u0000')) {
      return false
    }

    const controlChars = value.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g)?.length ?? 0
    return controlChars / Math.max(value.length, 1) < 0.02
  }

  private toDataUrl(buffer: Buffer, mimeType: string): string {
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  }
}
