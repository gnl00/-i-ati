import type {
  RunEventEmitter,
  RunEventEmitterFactory
} from '@main/orchestration/chat/run/infrastructure'
import type { PostRunJobInput } from './types'

export const createPostRunEmitter = (
  emitterFactory: RunEventEmitterFactory,
  args: PostRunJobInput
): RunEventEmitter =>
  emitterFactory.create({
    submissionId: args.submissionId,
    chatId: args.chatEntity.id,
    chatUuid: args.chatEntity.uuid
  })
