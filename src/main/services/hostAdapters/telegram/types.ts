import type { MainChatRunInput } from '@main/services/hostAdapters/chat'

export type TelegramPeerType = 'private' | 'group' | 'supergroup' | 'channel'

export type TelegramInboundMedia = {
  kind: 'photo' | 'document'
  fileId: string
  fileUniqueId?: string
  fileName?: string
  mimeType?: string
  fileSize?: number
  width?: number
  height?: number
}

export type TelegramInboundEnvelope = {
  updateId: number
  messageId: string
  chatId: string
  chatType: TelegramPeerType
  threadId?: string
  fromUserId?: string
  username?: string
  displayName?: string
  text: string
  media: TelegramInboundMedia[]
  isMentioned: boolean
  replyToBot: boolean
  receivedAt: number
}

export type TelegramReplyTarget = {
  type: 'telegram'
  chatId: string
  threadId?: string
  replyToMessageId?: string
}

export type MainTelegramRunInput = MainChatRunInput & {
  host: {
    type: 'telegram'
    updateId: number
    chatId: string
    messageId: string
    chatType: TelegramPeerType
    threadId?: string
    fromUserId?: string
    username?: string
    displayName?: string
  }
  replyTarget: TelegramReplyTarget
}
