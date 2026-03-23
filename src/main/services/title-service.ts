import { unifiedChatRequest } from '@main/request/index'
import { createLogger } from '@main/services/logging/LogService'
import { generateTitlePrompt } from '@shared/prompts'

const logger = createLogger('TitleService')

export async function generateTitle(
  content: string,
  model: AccountModel,
  account: ProviderAccount,
  providerDefinition: ProviderDefinition
): Promise<string> {
  logger.info('title.request.started', {
    modelId: model.id,
    providerId: providerDefinition.id,
    adapterPluginId: providerDefinition.adapterPluginId,
    contentLength: content.length,
    contentPreview: content.slice(0, 80)
  })

  const titleReq: IUnifiedRequest = {
    adapterPluginId: providerDefinition.adapterPluginId,
    baseUrl: account.apiUrl,
    apiKey: account.apiKey,
    model: model.id,
    messages: [{ role: 'user', content: generateTitlePrompt(content), segments: [] }],
    stream: false,
    options: {
      maxTokens: 32
    }
  }

  const response = await unifiedChatRequest(titleReq, null, () => {}, () => {})
  const rawTitle = response.content ?? ''
  const trimmedTitle = rawTitle.trim()

  logger.info('title.request.completed', {
    modelId: model.id,
    providerId: providerDefinition.id,
    rawTitle,
    trimmedTitle
  })

  return rawTitle
}
