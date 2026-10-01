import { chatDb } from '@main/db/chat'
import { HostChatBindingService } from '@main/hosts/shared/HostChatBindingService'
import type { MainTelegramRunInput, TelegramInboundEnvelope } from './types'
import { buildTelegramInputText } from './telegram-input-text'

export class TelegramAgentAdapter {
  constructor(
    private readonly hostChatBindingService = new HostChatBindingService()
  ) {}

  resolveOrCreateSession(
    envelope: TelegramInboundEnvelope,
    modelRef: ModelRef
  ): Promise<{ chat: ChatEntity; binding: ChatHostBindingEntity; created: boolean }>
  resolveOrCreateSession(
    envelope: TelegramInboundEnvelope,
    modelRef: ModelRef,
    botId: string | undefined
  ): Promise<{ chat: ChatEntity; binding?: ChatHostBindingEntity; created: boolean }>
  async resolveOrCreateSession(
    envelope: TelegramInboundEnvelope,
    modelRef: ModelRef,
    botId?: string
  ): Promise<{ chat: ChatEntity; binding?: ChatHostBindingEntity; created: boolean }> {
    if (botId && envelope.replyToBot && envelope.replyToMessageId) {
      const chatUuid = chatDb.getTelegramReplyChat(
        botId, envelope.chatId, envelope.replyToMessageId, envelope.threadId
      )
      const chat = chatUuid ? chatDb.getChatByUuid(chatUuid) : undefined
      if (chat) {
        // A reply selects its source chat for this run only; ordinary inbound routing stays unchanged.
        return { chat, created: false }
      }
    }
    const result = await this.hostChatBindingService.resolveOrCreate({
      hostType: 'telegram',
      hostChatId: envelope.chatId,
      hostThreadId: envelope.threadId,
      hostUserId: envelope.fromUserId,
      title: 'NewChat',
      modelRef,
      metadata: {
        chatType: envelope.chatType,
        username: envelope.username,
        displayName: envelope.displayName
      }
    })

    return {
      chat: result.chat,
      binding: result.binding,
      created: result.created
    }
  }

  buildRunInput(args: {
    submissionId: string
    envelope: TelegramInboundEnvelope
    modelRef: ModelRef
    chatModelRef?: ModelRef
    chat: ChatEntity
    mediaCtx?: string[]
    attachmentTextBlocks?: string[]
  }): MainTelegramRunInput {
    const {
      submissionId,
      envelope,
      modelRef,
      chatModelRef,
      chat,
      mediaCtx = [],
      attachmentTextBlocks = []
    } = args

    return {
      submissionId,
      modelRef,
      ...(chatModelRef ? { chatModelRef } : {}),
      chatId: chat.id,
      chatUuid: chat.uuid,
      input: {
        textCtx: this.buildInputText(envelope, attachmentTextBlocks),
        mediaCtx,
        source: 'telegram',
        host: this.buildInboundHostMeta(envelope),
        stream: true
      },
      host: {
        type: 'telegram',
        updateId: envelope.updateId,
        chatId: envelope.chatId,
        messageId: envelope.messageId,
        chatType: envelope.chatType,
        threadId: envelope.threadId,
        fromUserId: envelope.fromUserId,
        username: envelope.username,
        displayName: envelope.displayName
      },
      replyTarget: {
        type: 'telegram',
        chatId: envelope.chatId,
        threadId: envelope.threadId,
        replyToMessageId: envelope.messageId
      }
    }
  }

  buildInboundHostMeta(envelope: TelegramInboundEnvelope): ChatMessageHostMeta {
    return {
      type: 'telegram',
      direction: 'inbound',
      peerId: envelope.chatId,
      peerType: envelope.chatType,
      threadId: envelope.threadId,
      messageId: envelope.messageId,
      userId: envelope.fromUserId,
      username: envelope.username,
      displayName: envelope.displayName,
      attachments: envelope.media.map((media) => ({
        kind: media.kind,
        fileId: media.fileId,
        fileUniqueId: media.fileUniqueId,
        fileName: media.fileName,
        mimeType: media.mimeType,
        fileSize: media.fileSize,
        width: media.width,
        height: media.height
      }))
    }
  }

  buildOutboundHostMeta(args: {
    envelope: TelegramInboundEnvelope
    sentMessageId?: string
  }): ChatMessageHostMeta {
    return {
      type: 'telegram',
      direction: 'outbound',
      peerId: args.envelope.chatId,
      peerType: args.envelope.chatType,
      threadId: args.envelope.threadId,
      messageId: args.sentMessageId,
      replyToMessageId: args.envelope.messageId
    }
  }

  private buildInputText(envelope: TelegramInboundEnvelope, attachmentTextBlocks: string[] = []): string {
    return buildTelegramInputText(envelope, attachmentTextBlocks)
  }
}
