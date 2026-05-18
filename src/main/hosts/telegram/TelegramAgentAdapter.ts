import { HostChatBindingService } from '@main/hosts/shared/HostChatBindingService'
import type { MainTelegramRunInput, TelegramInboundEnvelope } from './types'
import { buildTelegramInputText } from './telegram-input-text'

export class TelegramAgentAdapter {
  constructor(
    private readonly hostChatBindingService = new HostChatBindingService()
  ) {}

  async resolveOrCreateSession(
    envelope: TelegramInboundEnvelope,
    modelRef: ModelRef
  ): Promise<{ chat: ChatEntity; binding: ChatHostBindingEntity; created: boolean }> {
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
    chat: ChatEntity
    mediaCtx?: string[]
    attachmentTextBlocks?: string[]
  }): MainTelegramRunInput {
    const {
      submissionId,
      envelope,
      modelRef,
      chat,
      mediaCtx = [],
      attachmentTextBlocks = []
    } = args

    return {
      submissionId,
      modelRef,
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
