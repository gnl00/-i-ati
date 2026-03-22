import { generateTitle } from '@main/services/TitleService'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import { ChatRunEventEmitterFactory } from '@main/services/chatRun/infrastructure'
import { createLogger } from '@main/services/logging/LogService'
import {
  ChatEventMapper,
  ChatModelContextResolver,
  ChatSessionStore
} from '@main/services/hostAdapters/chat'
import { createPostRunEmitter, serializeError } from './utils'
import type { PostRunJobInput } from './types'

export class TitleJobService {
  private readonly logger = createLogger('TitleJobService')

  constructor(
    private readonly emitterFactory = new ChatRunEventEmitterFactory(),
    private readonly chatSessionStore = new ChatSessionStore(),
    private readonly chatModelContextResolver = new ChatModelContextResolver()
  ) {}

  async run(args: PostRunJobInput, config: IAppConfig): Promise<void> {
    if (!config.tools?.titleGenerateEnabled) {
      this.logger.debug('title.job.skipped.disabled', {
        chatUuid: args.chatEntity.uuid,
        chatId: args.chatEntity.id
      })
      return
    }

    if (args.chatEntity.title && args.chatEntity.title !== 'NewChat') {
      this.logger.debug('title.job.skipped.existing_title', {
        chatUuid: args.chatEntity.uuid,
        chatId: args.chatEntity.id,
        currentTitle: args.chatEntity.title
      })
      return
    }

    const titleRef = config.tools?.titleGenerateModel
    const titleContext = titleRef
      ? this.chatModelContextResolver.resolve(config, titleRef)
      : undefined
    const model = titleContext?.model ?? args.modelContext.model
    const account = titleContext?.account ?? args.modelContext.account
    const providerDefinition = titleContext?.providerDefinition ?? args.modelContext.providerDefinition
    const emitter = createPostRunEmitter(this.emitterFactory, args)
    const chatEventMapper = new ChatEventMapper(emitter)

    this.logger.info('title.job.started', {
      chatUuid: args.chatEntity.uuid,
      chatId: args.chatEntity.id,
      currentTitle: args.chatEntity.title,
      modelId: model.id,
      contentLength: args.content.length
    })

    emitter.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_STARTED, {
      model,
      contentLength: args.content.length
    })

    try {
      const title = (await generateTitle(args.content, model, account, providerDefinition)).trim()
      this.logger.info('title.job.generated', {
        chatUuid: args.chatEntity.uuid,
        chatId: args.chatEntity.id,
        currentTitle: args.chatEntity.title,
        generatedTitle: title
      })

      if (!title || title === args.chatEntity.title) {
        this.logger.warn('title.job.completed.noop', {
          chatUuid: args.chatEntity.uuid,
          chatId: args.chatEntity.id,
          currentTitle: args.chatEntity.title,
          generatedTitle: title
        })
        emitter.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_COMPLETED, {
          title: args.chatEntity.title || title
        })
        return
      }

      const updatedChat = this.chatSessionStore.updateChatTitle(args.chatEntity, title)
      chatEventMapper.emitChatUpdated(updatedChat)
      this.logger.info('title.job.completed.updated', {
        chatUuid: args.chatEntity.uuid,
        chatId: args.chatEntity.id,
        title
      })
      emitter.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_COMPLETED, { title })
    } catch (error) {
      this.logger.error('title.job.failed', {
        chatUuid: args.chatEntity.uuid,
        chatId: args.chatEntity.id,
        currentTitle: args.chatEntity.title,
        error
      })
      emitter.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_FAILED, { error: serializeError(error) })
    }
  }
}
