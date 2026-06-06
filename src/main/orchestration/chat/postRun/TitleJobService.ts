import { agent } from '@main/agent'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import { RunEventEmitterFactory } from '@main/orchestration/chat/run/infrastructure'
import { createLogger } from '@main/logging/LogService'
import { serializeError } from '@main/utils/serializeError'
import { resolveRequestOverrides } from '@main/request/overrides'
import { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import { ChatEventMapper } from '@main/hosts/chat/mapping/ChatEventMapper'
import { ChatSessionStore } from '@main/hosts/chat/persistence/ChatSessionStore'
import { HIDDEN_MESSAGE_SOURCES } from '@shared/messages/messageSources'
import { buildTitleAgentSystemPrompt } from '@shared/prompts/title-agent'
import { createPostRunEmitter } from './utils'
import type { PostRunJobInput } from './types'

const TITLE_THINKING_OPTION: UnifiedRequestThinkingOption = { enabled: false }

function isDefaultChatTitle(title?: string): boolean {
  return !title || title === 'NewChat'
}

const isSupportedChatRole = (
  role: string
): role is UnifiedRequestMessageRole => (
  role === 'user' || role === 'assistant' || role === 'tool'
)

const toUnifiedRequestMessage = (message: ChatMessage): UnifiedRequestMessage | null => {
  if (!isSupportedChatRole(message.role)) {
    return null
  }

  if (message.source && HIDDEN_MESSAGE_SOURCES.has(message.source)) {
    return null
  }

  if (message.role === 'tool') {
    if (!message.toolCallId) {
      return null
    }

    return {
      role: 'tool',
      content: message.content,
      toolCallId: message.toolCallId,
      toolName: message.name || 'tool'
    }
  }

  if (message.role === 'assistant') {
    const hasText = typeof message.content === 'string'
      ? message.content.trim().length > 0
      : message.content.length > 0
    const toolCalls = message.toolCalls?.length ? message.toolCalls : undefined

    if (!hasText && !toolCalls) {
      return null
    }

    return {
      role: 'assistant',
      content: message.content,
      ...(toolCalls ? { toolCalls } : {}),
      ...(message.segments?.some(segment => segment.type === 'reasoning')
        ? {
          reasoning: message.segments
            .filter(segment => segment.type === 'reasoning' && typeof segment.content === 'string')
            .map(segment => segment.content)
            .join('\n')
        }
        : {})
    }
  }

  const hasContent = typeof message.content === 'string'
    ? message.content.trim().length > 0
    : message.content.length > 0

  if (!hasContent) {
    return null
  }

  return {
    role: 'user',
    content: message.content
  }
}

const buildTitleAgentMessages = (args: PostRunJobInput): UnifiedRequestMessage[] => {
  const messages = args.messageBuffer
    .map(message => toUnifiedRequestMessage(message.body))
    .filter((message): message is UnifiedRequestMessage => (
      Boolean(message) && (message.role === 'user' || message.role === 'assistant')
    ))
    .slice(-2)

  if (messages.length > 0) {
    return messages
  }

  return [{
    role: 'user',
    content: args.content
  }]
}

export class TitleJobService {
  private readonly logger = createLogger('TitleJobService')

  constructor(
    private readonly emitterFactory = new RunEventEmitterFactory(),
    private readonly chatSessionStore = new ChatSessionStore(),
    private readonly chatModelContextResolver = new ChatModelContextResolver(),
    private readonly titleAgent: typeof agent = agent
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
      const result = await this.titleAgent(
        'title-generator',
        buildTitleAgentSystemPrompt(latestChatAtStart.uuid),
        ['chat_set_title'],
        buildTitleAgentMessages(args),
        false,
        {
          model,
          account,
          providerDefinition,
          sanitizeOverrides: providerOverrides => resolveRequestOverrides(providerOverrides, 'title'),
          requestOptions: {
            thinking: TITLE_THINKING_OPTION
          }
        }
      )

      if (result.type === 'tool_call') {
        const latestChatAfterTool = this.chatSessionStore.reloadChatEntity(args.chatEntity)
        const title = latestChatAfterTool.title || latestChatAtStart.title

        if (!isDefaultChatTitle(latestChatAfterTool.title)) {
          chatEventMapper.emitChatUpdated(latestChatAfterTool)
          this.logger.info('title.job.completed.updated', {
            chatUuid: latestChatAfterTool.uuid,
            chatId: latestChatAfterTool.id,
            title,
            toolCallCount: result.toolCalls?.length ?? 0
          })
        } else {
          this.logger.warn('title.job.completed.noop', {
            chatUuid: latestChatAfterTool.uuid,
            chatId: latestChatAfterTool.id,
            currentTitle: latestChatAfterTool.title,
            toolCallCount: result.toolCalls?.length ?? 0
          })
        }

        emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED, {
          title
        })
        return
      }

      if (result.type === 'text') {
        this.logger.warn('title.job.completed.no_tool_call', {
          chatUuid: latestChatAtStart.uuid,
          chatId: latestChatAtStart.id,
          currentTitle: latestChatAtStart.title,
          content: result.content
        })
        emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED, {
          title: latestChatAtStart.title
        })
        return
      }

      this.logger.error('title.job.failed', {
        chatUuid: args.chatEntity.uuid,
        chatId: args.chatEntity.id,
        currentTitle: args.chatEntity.title,
        error: result.error
      })
      emitter.emit(RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_FAILED, {
        error: serializeError(new Error(result.error || 'Title agent failed'))
      })
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
