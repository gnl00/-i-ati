import { RunEventEmitterFactory } from '@main/orchestration/chat/run/infrastructure'
import { createLogger } from '@main/logging/LogService'
import { unifiedChatRequest } from '@main/request/index'
import { serializeError } from '@main/utils/serializeError'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import { generateTitlePrompt } from '@shared/prompts'
import type { TitleGenerationInput } from './types'

const logger = createLogger('TitleGenerator')

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

export class TitleGenerationService {
  constructor(
    private readonly emitterFactory = new RunEventEmitterFactory(),
    private readonly titleGenerator: typeof generateTitle = generateTitle
  ) {}

  async generate(data: TitleGenerationInput): Promise<{ title: string }> {
    const emitter = this.emitterFactory.createOptional(data)

    emitter?.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_STARTED, {
      model: data.model,
      contentLength: data.content?.length || 0
    })

    try {
      const title = await this.titleGenerator(
        data.content,
        data.model,
        data.account,
        data.providerDefinition
      )
      emitter?.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED, { title })
      return { title }
    } catch (error) {
      emitter?.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_FAILED, {
        error: serializeError(error)
      })
      throw error
    }
  }
}
