import { generateTitle } from '@main/orchestration/chat/maintenance/TitleGenerationService'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import { RunEventEmitterFactory } from '@main/orchestration/chat/run/infrastructure'
import { createLogger } from '@main/logging/LogService'
import { serializeError } from '@main/utils/serializeError'
import { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import { ChatEventMapper } from '@main/hosts/chat/mapping/ChatEventMapper'
import { ChatSessionStore } from '@main/hosts/chat/persistence/ChatSessionStore'
import { createPostRunEmitter } from './utils'
import type { PostRunJobInput } from './types'

export class TitleJobService {
  private readonly logger = createLogger('TitleJobService')

  constructor(
    private readonly emitterFactory = new RunEventEmitterFactory(),
    private readonly chatSessionStore = new ChatSessionStore(),
    private readonly chatModelContextResolver = new ChatModelContextResolver(),
    private readonly titleGenerator: typeof generateTitle = generateTitle
  ) {}

  shouldRun(args: PostRunJobInput, config: IAppConfig): boolean {
    if (!config.tools?.titleGenerateEnabled) {
      return false
    }

    if (args.chatEntity.title && args.chatEntity.title !== 'NewChat') {
      return false
    }

    return true
  }

  async run(args: PostRunJobInput, config: IAppConfig): Promise<void> {
    if (!this.shouldRun(args, config)) {
      if (!config.tools?.titleGenerateEnabled) {
        this.logger.debug('title.job.skipped.disabled', {
          chatUuid: args.chatEntity.uuid,
          chatId: args.chatEntity.id
        })
      } else {
        this.logger.debug('title.job.skipped.existing_title', {
          chatUuid: args.chatEntity.uuid,
          chatId: args.chatEntity.id,
          currentTitle: args.chatEntity.title
        })
      }
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

    emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_STARTED, {
      model,
      contentLength: args.content.length
    })

    try {
      const title = (await this.titleGenerator(args.content, model, account, providerDefinition)).trim()
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
        emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED, {
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
      emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED, { title })
    } catch (error) {
      this.logger.error('title.job.failed', {
        chatUuid: args.chatEntity.uuid,
        chatId: args.chatEntity.id,
        currentTitle: args.chatEntity.title,
        error
      })
      emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_FAILED, { error: serializeError(error) })
    }
  }
}
