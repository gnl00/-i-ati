import { compressionService } from '@main/services/compression-service'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import { ChatRunEventEmitterFactory } from '@main/services/chatRun/infrastructure'
import { serializeError } from '@main/services/serializeError'
import { createPostRunEmitter } from './utils'
import type { PostRunJobInput } from './types'

export class CompressionJobService {
  constructor(
    private readonly emitterFactory = new ChatRunEventEmitterFactory()
  ) {}

  shouldRun(args: PostRunJobInput, config: IAppConfig): boolean {
    const compressionConfig = config.compression
    return Boolean(compressionConfig?.enabled && compressionConfig.autoCompress && args.chatEntity.id)
  }

  async run(args: PostRunJobInput, config: IAppConfig): Promise<void> {
    const compressionConfig = config.compression
    if (!this.shouldRun(args, config) || !compressionConfig) {
      return
    }
    const chatId = args.chatEntity.id
    if (!chatId) {
      return
    }

    const emitter = createPostRunEmitter(this.emitterFactory, args)

    emitter.emit(CHAT_RUN_EVENTS.COMPRESSION_STARTED, {
      messageCount: args.messageBuffer.length
    })

    try {
      const result = await compressionService.execute({
        chatId,
        chatUuid: args.chatEntity.uuid,
        messages: args.messageBuffer,
        model: args.modelContext.model,
        account: args.modelContext.account,
        providerDefinition: args.modelContext.providerDefinition,
        config: compressionConfig
      })

      if (result.success) {
        emitter.emit(CHAT_RUN_EVENTS.COMPRESSION_COMPLETED, { result })
        return
      }

      emitter.emit(CHAT_RUN_EVENTS.COMPRESSION_FAILED, {
        error: {
          name: 'CompressionError',
          message: result.error || 'Compression failed'
        },
        result
      })
    } catch (error) {
      emitter.emit(CHAT_RUN_EVENTS.COMPRESSION_FAILED, {
        error: serializeError(error)
      })
    }
  }
}
