import { generateTitle } from '@main/services/title-service'
import { ChatRunEventEmitterFactory } from '@main/services/chatRun/infrastructure'
import { serializeError } from '@main/services/serializeError'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import type { ChatTitleGenerateInput } from './types'

export class TitleGenerationService {
  constructor(
    private readonly emitterFactory = new ChatRunEventEmitterFactory()
  ) {}

  async generate(data: ChatTitleGenerateInput): Promise<{ title: string }> {
    const emitter = this.emitterFactory.createOptional(data)

    emitter?.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_STARTED, {
      model: data.model,
      contentLength: data.content?.length || 0
    })

    try {
      const title = await generateTitle(
        data.content,
        data.model,
        data.account,
        data.providerDefinition
      )
      emitter?.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_COMPLETED, { title })
      return { title }
    } catch (error) {
      emitter?.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_FAILED, {
        error: serializeError(error)
      })
      throw error
    }
  }
}
