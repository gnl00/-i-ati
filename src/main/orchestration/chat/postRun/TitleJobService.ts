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

function isDefaultChatTitle(title?: string): boolean {
  return !title || title === 'NewChat'
}

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

    if (!isDefaultChatTitle(args.chatEntity.title)) {
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

    const latestChatAtStart = this.chatSessionStore.reloadChatEntity(args.chatEntity)
    if (!isDefaultChatTitle(latestChatAtStart.title)) {
      this.logger.debug('title.job.skipped.existing_title', {
        chatUuid: latestChatAtStart.uuid,
        chatId: latestChatAtStart.id,
        currentTitle: latestChatAtStart.title
      })
      const emitter = createPostRunEmitter(this.emitterFactory, args)
      emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED, {
        title: latestChatAtStart.title
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
      chatUuid: latestChatAtStart.uuid,
      chatId: latestChatAtStart.id,
      currentTitle: latestChatAtStart.title,
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
        chatUuid: latestChatAtStart.uuid,
        chatId: latestChatAtStart.id,
        currentTitle: latestChatAtStart.title,
        generatedTitle: title
      })

      const latestChatBeforeWrite = this.chatSessionStore.reloadChatEntity(args.chatEntity)
      if (!isDefaultChatTitle(latestChatBeforeWrite.title)) {
        this.logger.info('title.job.completed.skipped_existing_title', {
          chatUuid: latestChatBeforeWrite.uuid,
          chatId: latestChatBeforeWrite.id,
          currentTitle: latestChatBeforeWrite.title,
          generatedTitle: title
        })
        emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED, {
          title: latestChatBeforeWrite.title
        })
        return
      }

      if (!title || title === latestChatBeforeWrite.title) {
        this.logger.warn('title.job.completed.noop', {
          chatUuid: latestChatBeforeWrite.uuid,
          chatId: latestChatBeforeWrite.id,
          currentTitle: latestChatBeforeWrite.title,
          generatedTitle: title
        })
        emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED, {
          title: latestChatBeforeWrite.title || title
        })
        return
      }

      const updatedChat = this.chatSessionStore.updateChatTitle(latestChatBeforeWrite, title)
      chatEventMapper.emitChatUpdated(updatedChat)
      this.logger.info('title.job.completed.updated', {
        chatUuid: updatedChat.uuid,
        chatId: updatedChat.id,
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
