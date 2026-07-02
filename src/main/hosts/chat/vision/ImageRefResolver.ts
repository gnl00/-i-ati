import DatabaseService from '@main/db/DatabaseService'
import { HIDDEN_MESSAGE_SOURCES } from '@shared/messages/messageSources'

export type ImageRefResolverDeps = {
  getMessagesByChatUuid?: (chatUuid: string) => MessageEntity[]
}

export type ResolvedImageRef = {
  ref: string
  sourceRef: string
  messageId: number
  imageIndex: number
  url: string
}

export type ResolvedVisionImage = {
  ref: string
  url: string
}

export type VisionImageInput = {
  ref?: string
  url?: string
  raw_data?: string
}

export type VisionImageResolveResult = {
  ref: string
  success: true
  images: ResolvedVisionImage[]
} | {
  ref: string
  success: false
  images: []
  error: string
}

const IMAGE_REF_PATTERN = /^message:(\d+)(?:#image:(\d+))?$/

const parseImageRef = (ref: string): { messageId: number; imageIndex?: number } => {
  const trimmed = ref.trim()
  const match = IMAGE_REF_PATTERN.exec(trimmed)
  if (!match) {
    throw new Error(`Invalid image ref "${ref}". Use message:<messageId> or message:<messageId>#image:<oneBasedIndex>.`)
  }

  const messageId = Number(match[1])
  const imageIndex = match[2] ? Number(match[2]) : undefined
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new Error(`Invalid image ref "${ref}". Message id must be a positive integer.`)
  }
  if (imageIndex !== undefined && (!Number.isSafeInteger(imageIndex) || imageIndex <= 0)) {
    throw new Error(`Invalid image ref "${ref}". Image index must be a positive one-based integer.`)
  }

  return { messageId, imageIndex }
}

const getImageUrls = (message: MessageEntity): string[] => {
  const content = message.body.content
  if (!Array.isArray(content)) {
    return []
  }

  return content
    .filter(part => part?.type === 'image_url' && typeof part.image_url?.url === 'string')
    .map(part => part.image_url!.url.trim())
    .filter(Boolean)
}

export class ImageRefResolver {
  private readonly getMessagesByChatUuid: (chatUuid: string) => MessageEntity[]

  constructor(deps: ImageRefResolverDeps = {}) {
    this.getMessagesByChatUuid = deps.getMessagesByChatUuid ?? DatabaseService.getMessagesByChatUuid.bind(DatabaseService)
  }

  resolve(chatUuid: string | undefined, refs: string[]): ResolvedImageRef[] {
    const normalizedChatUuid = chatUuid?.trim()
    if (!normalizedChatUuid) {
      throw new Error('chat_uuid is required to resolve image refs.')
    }

    const normalizedRefs = refs.map(ref => ref.trim()).filter(Boolean)
    if (normalizedRefs.length === 0) {
      return []
    }

    const messages = this.getMessagesByChatUuid(normalizedChatUuid)
    const messagesById = new Map<number, MessageEntity>()
    for (const message of messages) {
      if (message.id != null) {
        messagesById.set(message.id, message)
      }
    }

    return normalizedRefs.flatMap(ref => this.resolveOne(normalizedChatUuid, messagesById, ref))
  }

  resolveImages(images: VisionImageInput[], chatUuid?: string): VisionImageResolveResult[] {
    return images.map((image, index) => {
      const inputRef = image.ref?.trim()
      const inputUrl = image.url?.trim()
      const rawData = image.raw_data?.trim()
      const fallbackRef = `input:${index + 1}`

      try {
        if (inputRef) {
          const resolved = this.resolve(chatUuid, [inputRef])
          return {
            ref: inputRef,
            success: true,
            images: resolved.map(item => ({
              ref: item.ref,
              url: item.url
            }))
          }
        }

        if (inputUrl) {
          return {
            ref: inputUrl,
            success: true,
            images: [{
              ref: inputUrl,
              url: inputUrl
            }]
          }
        }

        if (rawData) {
          return {
            ref: fallbackRef,
            success: true,
            images: [{
              ref: fallbackRef,
              url: rawData
            }]
          }
        }

        return {
          ref: fallbackRef,
          success: false,
          images: [],
          error: 'image input must include ref, url, or raw_data'
        }
      } catch (error) {
        return {
          ref: inputRef || inputUrl || fallbackRef,
          success: false,
          images: [],
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })
  }

  private resolveOne(
    chatUuid: string,
    messagesById: Map<number, MessageEntity>,
    ref: string
  ): ResolvedImageRef[] {
    const parsed = parseImageRef(ref)
    const message = messagesById.get(parsed.messageId)
    if (!message) {
      throw new Error(`Image ref "${ref}" was not found in chat_uuid "${chatUuid}".`)
    }
    if (message.chatUuid && message.chatUuid !== chatUuid) {
      throw new Error(`Image ref "${ref}" belongs to chat_uuid "${message.chatUuid}", requested "${chatUuid}".`)
    }
    if (message.body.role !== 'user') {
      throw new Error(`Image ref "${ref}" points to a non-user message.`)
    }
    if (message.body.source && HIDDEN_MESSAGE_SOURCES.has(message.body.source)) {
      throw new Error(`Image ref "${ref}" points to a hidden message.`)
    }

    const imageUrls = getImageUrls(message)
    if (imageUrls.length === 0) {
      throw new Error(`Image ref "${ref}" points to a message without image_url parts.`)
    }

    const sourceRef = `message:${parsed.messageId}`
    if (parsed.imageIndex === undefined) {
      return imageUrls.map((url, index) => ({
        ref: `${sourceRef}#image:${index + 1}`,
        sourceRef,
        messageId: parsed.messageId,
        imageIndex: index + 1,
        url
      }))
    }

    const url = imageUrls[parsed.imageIndex - 1]
    if (!url) {
      throw new Error(`Image ref "${ref}" is out of range. Message ${parsed.messageId} has ${imageUrls.length} image_url part(s).`)
    }

    return [{
      ref: `${sourceRef}#image:${parsed.imageIndex}`,
      sourceRef,
      messageId: parsed.messageId,
      imageIndex: parsed.imageIndex,
      url
    }]
  }
}
