import { getChatById, updateChat } from '@renderer/db/ChatRepository'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useChatStore } from '@renderer/store'
import { invokeChatCompressionExecute, invokeChatTitleGenerate } from '@renderer/invoker/ipcInvoker'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'
import type { FinalizeService } from './finalize-service'
import type { MessageService } from './message-service'

export class DefaultFinalizeService implements FinalizeService {
  constructor(private readonly messageService: MessageService) {}

  async finalize(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<void> {
    const { chatEntity } = context.session
    const metaWithChat = {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: chatEntity.uuid
    }
    const snapshot = context.meta.snapshot

    const appConfig = useAppConfigStore.getState()
    const { titleGenerateEnabled, titleGenerateModel } = appConfig
    let pendingTitleGeneration:
      | {
          content: string
          model: AccountModel
          account: ProviderAccount
          providerDefinition: ProviderDefinition
        }
      | undefined

    if (!chatEntity.title || chatEntity.title === 'NewChat') {
      let title = context.input.textCtx.substring(0, 30)
      if (titleGenerateEnabled) {
        const resolved = titleGenerateModel ? appConfig.resolveModelRef(titleGenerateModel) : undefined
        pendingTitleGeneration = {
          content: context.input.textCtx,
          model: resolved?.model ?? snapshot.model,
          account: resolved?.account ?? snapshot.account,
          providerDefinition: resolved?.definition ?? snapshot.providerDefinition
        }
      }
      chatEntity.title = title
    }

    await this.messageService.updateAssistantMessagesFromSegments(context, publisher, metaWithChat)
    await this.messageService.persistToolMessages(context, publisher, metaWithChat)

    chatEntity.model = context.meta.model.id
    chatEntity.updateTime = Date.now()
    await updateChat(chatEntity)

    const updatedChat = await getChatById(chatEntity.id!)
    if (updatedChat) {
      chatEntity.msgCount = updatedChat.msgCount
      chatEntity.workspacePath = updatedChat.workspacePath
    }

    await publisher.emit('chat.updated', { chatEntity }, metaWithChat)

    if (pendingTitleGeneration) {
      void this.generateTitleInBackground({
        chatEntity,
        submissionId: meta.submissionId,
        chatId: metaWithChat.chatId,
        chatUuid: metaWithChat.chatUuid,
        ...pendingTitleGeneration
      })
    }

    const compressionConfig = appConfig.compression
    if (compressionConfig?.enabled && compressionConfig?.autoCompress) {
      invokeChatCompressionExecute({
        submissionId: meta.submissionId,
        chatId: chatEntity.id!,
        chatUuid: chatEntity.uuid,
        messages: context.session.messageEntities,
        model: snapshot.model,
        account: snapshot.account,
        providerDefinition: snapshot.providerDefinition,
        config: compressionConfig
      }).catch(error => {
        console.error('[Compression] Failed to compress messages:', error)
      })
    }
  }

  private async generateTitleInBackground(args: {
    chatEntity: ChatEntity
    submissionId: string
    chatId?: number
    chatUuid?: string
    content: string
    model: AccountModel
    account: ProviderAccount
    providerDefinition: ProviderDefinition
  }): Promise<void> {
    try {
      const response = await invokeChatTitleGenerate({
        submissionId: args.submissionId,
        chatId: args.chatId,
        chatUuid: args.chatUuid,
        content: args.content,
        model: args.model,
        account: args.account,
        providerDefinition: args.providerDefinition
      })

      const nextTitle = response.title?.trim()
      if (!nextTitle || nextTitle === args.chatEntity.title) {
        return
      }

      const latestChat = args.chatEntity.id ? await getChatById(args.chatEntity.id) : undefined
      const updatedChat: ChatEntity = {
        ...(latestChat ?? args.chatEntity),
        title: nextTitle,
        updateTime: Date.now()
      }

      await updateChat(updatedChat)

      const chatStore = useChatStore.getState()
      chatStore.updateChatList(updatedChat)
      if (chatStore.currentChatUuid === updatedChat.uuid) {
        chatStore.setChatTitle(nextTitle)
      }
    } catch (error) {
      console.error('[Finalize] Failed to generate title:', error)
    }
  }
}
