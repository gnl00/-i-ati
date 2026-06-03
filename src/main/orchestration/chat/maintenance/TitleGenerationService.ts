import { RunEventEmitterFactory } from '@main/orchestration/chat/run/infrastructure'
import { createLogger } from '@main/logging/LogService'
import { unifiedChatRequest } from '@main/request/index'
import { createUnifiedTextRequest } from '@main/request/UnifiedRequestFactory'
import { serializeError } from '@main/utils/serializeError'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import { generateTitlePrompt } from '@shared/prompts'
import type { TitleGenerationInput } from './types'

const logger = createLogger('TitleGenerator')

const TITLE_THINKING_OPTION: UnifiedRequestThinkingOption = { enabled: false }

const isPlainObject = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const sanitizeTitleOutputConfigOverride = (value: unknown): unknown => {
  if (!isPlainObject(value)) {
    return value
  }

  const { effort: _effort, ...rest } = value
  return Object.keys(rest).length > 0 ? rest : undefined
}

const buildTitleGenerationRequestOverrides = (
  providerOverrides: ProviderDefinition['requestOverrides']
): ProviderDefinition['requestOverrides'] => {
  if (!isPlainObject(providerOverrides)) {
    return undefined
  }

  const {
    thinking: _thinking,
    reasoning: _reasoning,
    reasoning_effort: _reasoningEffort,
    output_config: outputConfig,
    ...rest
  } = providerOverrides
  const sanitizedOutputConfig = sanitizeTitleOutputConfigOverride(outputConfig)
  const requestOverrides = {
    ...rest,
    ...(sanitizedOutputConfig === undefined ? {} : { output_config: sanitizedOutputConfig })
  }

  return Object.keys(requestOverrides).length > 0 ? requestOverrides : undefined
}

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

  const prompt = generateTitlePrompt(content)
  const titleReq = createUnifiedTextRequest({
    adapterPluginId: providerDefinition.adapterPluginId,
    baseUrl: account.apiUrl,
    apiKey: account.apiKey,
    model: model.id,
    content: prompt,
    stream: false,
    requestOverrides: buildTitleGenerationRequestOverrides(providerDefinition.requestOverrides),
    options: {
      maxTokens: 32,
      thinking: TITLE_THINKING_OPTION
    }
  })

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
