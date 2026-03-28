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
