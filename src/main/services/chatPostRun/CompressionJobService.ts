import { compressionService } from '@main/services/compression-service'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import { ChatRunEventEmitterFactory } from '@main/services/chatRun/infrastructure'
import { createPostRunEmitter, serializeError } from './utils'
import type { PostRunJobInput } from './types'

export class CompressionJobService {
  constructor(
    private readonly emitterFactory = new ChatRunEventEmitterFactory()
  ) {}

  async run(args: PostRunJobInput, config: IAppConfig): Promise<void> {
    const compressionConfig = config.compression
    if (!compressionConfig?.enabled || !compressionConfig.autoCompress || !args.chatEntity.id) {
      return
    }

    const emitter = createPostRunEmitter(this.emitterFactory, args)

    emitter.emit(CHAT_RUN_EVENTS.COMPRESSION_STARTED, {
      messageCount: args.messageBuffer.length
    })

    try {
      const result = await compressionService.execute({
        chatId: args.chatEntity.id,
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
