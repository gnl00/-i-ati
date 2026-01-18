import { getChatById, updateChat } from '@renderer/db/ChatRepository'
import { useAppConfigStore } from '@renderer/store/appConfig'
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

    const appConfig = useAppConfigStore.getState()
    const { titleGenerateEnabled, titleGenerateModel, providers } = appConfig

    if (!chatEntity.title || chatEntity.title === 'NewChat') {
      let title = context.input.textCtx.substring(0, 30)
      if (titleGenerateEnabled) {
        try {
          const model = titleGenerateModel || context.meta.model
          const titleProvider = providers?.findLast(p => p.name === model.provider)
          if (titleProvider) {
            const response = await invokeChatTitleGenerate({
              content: context.input.textCtx,
              model,
              provider: titleProvider
            })
            title = response.title || title
          }
        } catch (error) {
          console.error('[Finalize] Failed to generate title:', error)
        }
      }
      chatEntity.title = title
    }

    await this.messageService.updateAssistantMessagesFromSegments(context, publisher, metaWithChat)
    await this.messageService.persistToolMessages(context, publisher, metaWithChat)

    chatEntity.model = context.meta.model.value
    chatEntity.updateTime = Date.now()
    await updateChat(chatEntity)

    const updatedChat = await getChatById(chatEntity.id!)
    if (updatedChat) {
      chatEntity.msgCount = updatedChat.msgCount
      chatEntity.workspacePath = updatedChat.workspacePath
    }

    await publisher.emit('chat.updated', { chatEntity }, metaWithChat)

    const compressionConfig = appConfig.compression
    if (compressionConfig?.enabled && compressionConfig?.autoCompress) {
      invokeChatCompressionExecute({
        chatId: chatEntity.id!,
        chatUuid: chatEntity.uuid,
        messages: context.session.messageEntities,
        model: context.meta.model,
        provider: context.meta.provider,
        config: compressionConfig
      }).catch(error => {
        console.error('[Compression] Failed to compress messages:', error)
      })
    }
  }

}
