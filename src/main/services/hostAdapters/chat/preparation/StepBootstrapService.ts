import { ChatStepStore } from '../persistence'
import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'
import type { MainChatRunInput, RunEnvironment, StepBootstrap } from './types'

export class StepBootstrapService {
  constructor(private readonly chatStepStore = new ChatStepStore()) {}

  bootstrap(
    environment: RunEnvironment,
    input: MainChatRunInput,
    _emitter: ChatRunEventEmitter
  ): StepBootstrap {
    const userMessageEntity = this.chatStepStore.createUserMessage(
      environment.chat,
      environment.modelContext.model,
      input.input
    )

    const assistantPlaceholder = this.chatStepStore.createAssistantPlaceholder(
      environment.chat,
      environment.modelContext.model,
      input.modelRef,
      input.input.source,
      input.input.source === 'telegram'
        ? {
          ...(input.input.host ?? {
            type: 'telegram',
            direction: 'outbound',
            peerId: input.chatUuid ?? environment.chat.uuid
          }),
          direction: 'outbound'
        }
        : undefined
    )

    return {
      messageBuffer: [...environment.historyMessages, userMessageEntity, assistantPlaceholder],
      assistantPlaceholder
    }
  }
}
