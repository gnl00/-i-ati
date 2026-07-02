import { ChatStepStore } from '../persistence'
import { normalizeMediaUrls } from '../persistence/ChatStepStore'
import { VisionObservationService } from '../vision'
import { ChatEventMapper } from '../mapping'
import type { RunEventEmitter } from '@main/orchestration/chat/run/infrastructure'
import type { MainAgentRunInput, RunEnvironment, StepBootstrap } from './types'

export class StepBootstrapService {
  constructor(
    private readonly chatStepStore = new ChatStepStore(),
    private readonly visionObservationService = new VisionObservationService()
  ) {}

  async bootstrap(
    environment: RunEnvironment,
    input: MainAgentRunInput,
    emitter: RunEventEmitter
  ): Promise<StepBootstrap> {
    const userMessageEntity = this.chatStepStore.createUserMessage(
      environment.chat,
      environment.modelContext.model,
      input.input
    )
    const earlyEmittedMessageIds: number[] = []
    if (userMessageEntity.id != null) {
      new ChatEventMapper(emitter).emitMessageCreated(userMessageEntity)
      earlyEmittedMessageIds.push(userMessageEntity.id)
    }
    const visionObservation = normalizeMediaUrls(input.input.mediaCtx).length > 0
      ? await this.visionObservationService.observe({
        chat: environment.chat,
        userMessage: userMessageEntity,
        textCtx: input.input.textCtx,
        mediaCtx: input.input.mediaCtx,
        source: input.input.source,
        host: input.input.host
      })
      : undefined

    const assistantDraft = this.chatStepStore.buildAssistantDraft(
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
      messageBuffer: [
        ...environment.historyMessages,
        userMessageEntity,
        ...(visionObservation ? [visionObservation] : [])
      ],
      assistantDraft,
      earlyEmittedMessageIds
    }
  }
}
