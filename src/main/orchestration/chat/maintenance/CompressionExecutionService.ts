import { compressionService } from './MessageCompressionService'
import { RunEventEmitterFactory } from '@main/orchestration/chat/run/infrastructure'
import { serializeError } from '@main/utils/serializeError'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import type { CompressionExecutionInput } from './types'

export class CompressionExecutionService {
  constructor(
    private readonly emitterFactory = new RunEventEmitterFactory()
  ) {}

  async execute(data: CompressionExecutionInput): Promise<CompressionResult> {
    const emitter = this.emitterFactory.createOptional(data)

    emitter?.emit(RUN_MAINTENANCE_EVENTS.COMPRESSION_STARTED, {
      chatId: data.chatId,
      chatUuid: data.chatUuid,
      messageCount: data.messages?.length || 0
    })

    try {
      const result = await compressionService.execute(data)
      if (result.success) {
        emitter?.emit(RUN_MAINTENANCE_EVENTS.COMPRESSION_COMPLETED, { result })
      } else {
        emitter?.emit(RUN_MAINTENANCE_EVENTS.COMPRESSION_FAILED, {
          error: {
            name: 'CompressionError',
            message: result.error || 'Compression failed'
          },
          result
        })
      }
      return result
    } catch (error) {
      emitter?.emit(RUN_MAINTENANCE_EVENTS.COMPRESSION_FAILED, {
        error: serializeError(error)
      })
      throw error
    }
  }
}
