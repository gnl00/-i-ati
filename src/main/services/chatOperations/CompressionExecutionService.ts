import { compressionService } from '@main/services/CompressionService'
import { ChatRunEventEmitterFactory } from '@main/services/chatRun/infrastructure'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import type { ChatCompressionExecuteInput } from './types'
import { createOptionalChatRunEmitter, serializeError } from './utils'

export class CompressionExecutionService {
  constructor(
    private readonly emitterFactory = new ChatRunEventEmitterFactory()
  ) {}

  async execute(data: ChatCompressionExecuteInput): Promise<CompressionResult> {
    const emitter = createOptionalChatRunEmitter(this.emitterFactory, data)

    emitter?.emit(CHAT_RUN_EVENTS.COMPRESSION_STARTED, {
      chatId: data.chatId,
      chatUuid: data.chatUuid,
      messageCount: data.messages?.length || 0
    })

    try {
      const result = await compressionService.execute(data)
      if (result.success) {
        emitter?.emit(CHAT_RUN_EVENTS.COMPRESSION_COMPLETED, { result })
      } else {
        emitter?.emit(CHAT_RUN_EVENTS.COMPRESSION_FAILED, {
          error: {
            name: 'CompressionError',
            message: result.error || 'Compression failed'
          },
          result
        })
      }
      return result
    } catch (error) {
      emitter?.emit(CHAT_RUN_EVENTS.COMPRESSION_FAILED, {
        error: serializeError(error)
      })
      throw error
    }
  }
}
