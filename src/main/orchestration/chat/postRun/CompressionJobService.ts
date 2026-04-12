import { compressionService } from '@main/orchestration/chat/maintenance/MessageCompressionService'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import { RunEventEmitterFactory } from '@main/orchestration/chat/run/infrastructure'
import { serializeError } from '@main/utils/serializeError'
import { createPostRunEmitter } from './utils'
import type { PostRunJobInput } from './types'

export class CompressionJobService {
  constructor(
    private readonly emitterFactory = new RunEventEmitterFactory()
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

    emitter.emit(RUN_MAINTENANCE_EVENTS.COMPRESSION_STARTED, {
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
        emitter.emit(RUN_MAINTENANCE_EVENTS.COMPRESSION_COMPLETED, { result })
        return
      }

      emitter.emit(RUN_MAINTENANCE_EVENTS.COMPRESSION_FAILED, {
        error: {
          name: 'CompressionError',
          message: result.error || 'Compression failed'
        },
        result
      })
    } catch (error) {
      emitter.emit(RUN_MAINTENANCE_EVENTS.COMPRESSION_FAILED, {
        error: serializeError(error)
      })
    }
  }
}
