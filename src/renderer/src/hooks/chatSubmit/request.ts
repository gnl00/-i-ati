import { embeddedToolsRegistry } from '@tools/index'
import type { BuildRequestParams, PreparedRequest } from './types'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { getActiveCompressedSummariesByChatId } from '@renderer/db/CompressedSummaryRepository'
import { RequestMessageBuilder } from '@renderer/services/RequestMessageBuilder'

export const buildRequestV2 = async ({ prepared }: BuildRequestParams): Promise<PreparedRequest> => {
  // 1. 获取压缩摘要（如果启用）
  const appConfig = useAppConfigStore.getState()
  const compressionConfig = appConfig.compression

  let compressionSummary: CompressedSummaryEntity | null = null
  if (compressionConfig?.enabled && prepared.session.currChatId) {
    const summaries = await getActiveCompressedSummariesByChatId(prepared.session.currChatId)
    compressionSummary = summaries.length > 0 ? summaries[0] : null
  }

  // 2. 使用 RequestMessageBuilder 构建最终消息列表
  const messageBuilder = new RequestMessageBuilder()
    .setSystemPrompts(prepared.systemPrompts)
    .setMessages(prepared.session.messageEntities)
    .setCompressionSummary(compressionSummary)

  const finalMessages = messageBuilder.build()

  const embeddedTools = embeddedToolsRegistry.getAllTools()
  const finalTools = embeddedTools.map(tool => ({
    ...tool.function
  }))

  if (prepared.input.tools && prepared.input.tools.length > 0) {
    finalTools.push(...prepared.input.tools)
  }

  const request: IUnifiedRequest = {
    baseUrl: prepared.meta.provider.apiUrl,
    messages: finalMessages,
    apiKey: prepared.meta.provider.apiKey,
    // prompt field removed - system prompts now in messages
    model: prepared.meta.model.value,
    modelType: prepared.meta.model.type,
    tools: finalTools
  }

  return {
    ...prepared,
    request
  }
}
