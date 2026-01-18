import { embeddedToolsRegistry } from '@tools/registry'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { getActiveCompressedSummariesByChatId } from '@renderer/db/CompressedSummaryRepository'
import { RequestMessageBuilder } from '@renderer/services/RequestMessageBuilder'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'
import type { RequestService } from './request-service'

export class DefaultRequestService implements RequestService {
  async build(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<SubmissionContext> {
    const appConfig = useAppConfigStore.getState()
    const compressionConfig = appConfig.compression

    let compressionSummary: CompressedSummaryEntity | null = null
    if (compressionConfig?.enabled && context.session.currChatId) {
      const summaries = await getActiveCompressedSummariesByChatId(context.session.currChatId)
      compressionSummary = summaries.length > 0 ? summaries[0] : null
    }

    const messageBuilder = new RequestMessageBuilder()
      .setSystemPrompts(context.systemPrompts)
      .setMessages(context.session.messageEntities)
      .setCompressionSummary(compressionSummary)

    const finalMessages = messageBuilder.build()

    const embeddedTools = embeddedToolsRegistry.getAllTools()
    const finalTools = embeddedTools.map(tool => ({
      ...tool.function
    }))

    if (context.input.tools && context.input.tools.length > 0) {
      finalTools.push(...context.input.tools)
    }

    const snapshot = context.meta.snapshot

    const request: IUnifiedRequest = {
      providerType: snapshot.providerType,
      apiVersion: snapshot.apiVersion,
      baseUrl: snapshot.provider.apiUrl,
      messages: finalMessages,
      apiKey: snapshot.provider.apiKey,
      model: snapshot.model.value,
      modelType: snapshot.model.type,
      tools: finalTools,
      options: snapshot.options,
      stream: snapshot.stream
    }

    context.request = request
    context.compressionSummary = compressionSummary

    await publisher.emit('request.built', { messageCount: finalMessages.length }, {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    })

    return context
  }
}
