import type { SerializedError } from '@shared/chatRun/events'
import type {
  ChatRunEventEmitter,
  ChatRunEventEmitterFactory
} from '@main/services/chatRun/infrastructure'
import type { PostRunJobInput } from './types'

export const createPostRunEmitter = (
  emitterFactory: ChatRunEventEmitterFactory,
  args: PostRunJobInput
): ChatRunEventEmitter =>
  emitterFactory.create({
    submissionId: args.submissionId,
    chatId: args.chatEntity.id,
    chatUuid: args.chatEntity.uuid
  })

export const serializeError = (error: any, depth: number = 0): SerializedError => {
  const serialized: SerializedError = {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
    stack: error?.stack as string | undefined,
    code: typeof error?.code === 'string' ? error.code : undefined
  }

  if (depth >= 3 || !error?.cause) {
    return serialized
  }

  return {
    ...serialized,
    cause: serializeError(error.cause, depth + 1)
  }
}
