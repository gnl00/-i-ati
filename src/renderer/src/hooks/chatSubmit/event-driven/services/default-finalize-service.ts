import { generateTitlePrompt } from '@renderer/constant/prompts'
import { getChatById, updateChat } from '@renderer/db/ChatRepository'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { compressionService } from '@renderer/services/compressionService'
import { unifiedChatRequest } from '@request/index'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'
import type { FinalizeService } from './finalize-service'
import type { MessageService } from './message-service'

const providerTypeMap: Record<string, ProviderType> = {
  'Anthropic': 'claude',
  'Claude': 'claude'
}

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
          title = await this.generateTitle(
            context.input.textCtx,
            titleGenerateModel,
            context.meta.model,
            providers
          )
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
      compressionService.compress(
        chatEntity.id!,
        chatEntity.uuid,
        context.session.messageEntities,
        context.meta.model,
        context.meta.provider
      ).catch(error => {
        console.error('[Compression] Failed to compress messages:', error)
      })
    }
  }

  private async generateTitle(
    content: string,
    titleGenerateModel: IModel | undefined,
    selectedModel: IModel,
    providers: IProvider[]
  ): Promise<string> {
    const model = titleGenerateModel || selectedModel
    const titleProvider = providers.findLast(p => p.name === model.provider)!
    const providerType = providerTypeMap[titleProvider.name] || 'openai'

    const titleReq: IUnifiedRequest = {
      providerType,
      apiVersion: 'v1',
      baseUrl: titleProvider.apiUrl,
      apiKey: titleProvider.apiKey,
      model: model.value,
      prompt: generateTitlePrompt,
      messages: [{ role: 'user', content, segments: [] }],
      stream: false,
      options: {
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.7
      }
    }

    const response = await unifiedChatRequest(titleReq, null, () => { }, () => { })
    return response.content
  }
}
