import { embeddedToolsRegistry } from '@tools/index'
import type { BuildRequestParams, PreparedRequest } from './types'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { getActiveCompressedSummariesByChatId } from '@renderer/db/CompressedSummaryRepository'
import { compressionApplier } from '@renderer/services/compressionApplier'

export const buildRequestV2 = async ({ prepared }: BuildRequestParams): Promise<PreparedRequest> => {
  // 1. 应用压缩策略（如果启用）
  const appConfig = useAppConfigStore.getState()
  const compressionConfig = appConfig.compression

  let messagesToFilter = prepared.session.chatMessages

  if (compressionConfig?.enabled) {
    // 获取活跃的压缩摘要
    const summaries = await getActiveCompressedSummariesByChatId(prepared.session.currChatId)

    if (summaries.length > 0) {
      // 应用压缩策略
      // 注意：这里需要传入 MessageEntity[]，而不是 ChatMessage[]
      messagesToFilter = compressionApplier.applyCompression(
        prepared.session.messageEntities,  // 使用 messageEntities 而不是 chatMessages
        summaries
      )
    }
  }

  // 2. 过滤消息（现有逻辑）
  const filteredMessages = messagesToFilter.filter(msg => {
    if (msg.role === 'assistant') {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        return true
      }
      if (msg.content && (msg.content as string).trim() !== '') {
        return true
      }
      return false
    }
    return true
  })

  const embeddedTools = embeddedToolsRegistry.getAllTools()
  const finalTools = embeddedTools.map(tool => ({
    ...tool.function
  }))

  if (prepared.input.tools && prepared.input.tools.length > 0) {
    finalTools.push(...prepared.input.tools)
  }

  const request: IUnifiedRequest = {
    baseUrl: prepared.meta.provider.apiUrl,
    messages: filteredMessages,
    apiKey: prepared.meta.provider.apiKey,
    prompt: prepared.systemPrompts.join('\n'),
    model: prepared.meta.model.value,
    modelType: prepared.meta.model.type,
    tools: finalTools
  }

  return {
    ...prepared,
    request
  }
}
