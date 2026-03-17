import { generateTitle } from '@main/services/TitleService'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import { ChatRunEventEmitterFactory } from '@main/services/chatRun/infrastructure'
import {
  ChatEventMapper,
  ChatModelContextResolver,
  ChatSessionStore
} from '@main/services/hostAdapters/chat'
import { createPostRunEmitter, serializeError } from './utils'
import type { PostRunJobInput } from './types'

export class TitleJobService {
  constructor(
    private readonly emitterFactory = new ChatRunEventEmitterFactory(),
    private readonly chatSessionStore = new ChatSessionStore(),
    private readonly chatModelContextResolver = new ChatModelContextResolver()
  ) {}

  async run(args: PostRunJobInput, config: IAppConfig): Promise<void> {
    if (!config.tools?.titleGenerateEnabled) {
      return
    }

    if (args.chatEntity.title && args.chatEntity.title !== 'NewChat') {
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

    emitter.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_STARTED, {
      model,
      contentLength: args.content.length
    })

    try {
      const title = (await generateTitle(args.content, model, account, providerDefinition)).trim()
      if (!title || title === args.chatEntity.title) {
        emitter.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_COMPLETED, {
          title: args.chatEntity.title || title
        })
        return
      }

      const updatedChat = this.chatSessionStore.updateChatTitle(args.chatEntity, title)
      chatEventMapper.emitChatUpdated(updatedChat)
      emitter.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_COMPLETED, { title })
    } catch (error) {
      emitter.emit(CHAT_RUN_EVENTS.TITLE_GENERATE_FAILED, { error: serializeError(error) })
    }
  }
}
