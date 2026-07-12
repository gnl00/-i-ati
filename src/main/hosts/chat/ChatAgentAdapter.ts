import type { RunResult, StepResult } from '@main/agent/contracts'
import { ChatFinalizeService } from './finalize/ChatFinalizeService'
import { ChatEventMapper, ChatStepRuntimeContextMapper, type ChatStepRuntimeContext } from './mapping'
import type { MainAgentRunInput, RunPreparationResult } from './preparation'
import { ChatPreparationPipeline } from './preparation'
import type { RunEventEmitter } from '@main/agent/contracts'

type FinalizeRunArgs = {
  input: MainAgentRunInput
  runSpec: RunPreparationResult['runSpec']
  chatContext: RunPreparationResult['chatContext']
  stepResult: StepResult
  emitter: RunEventEmitter
  stepCommitter: {
    getFinalAssistantMessage(): MessageEntity
    getLastUsage(): ITokenUsage | undefined
  }
}

type AbortRunArgs = Pick<FinalizeRunArgs, 'chatContext' | 'stepCommitter' | 'emitter'> & {
  submissionId?: string
  reason?: string
}

type FinalizeRunResult = {
  runResult: RunResult
  postRunInput: {
    submissionId: string
    chatEntity: RunPreparationResult['chatContext']['chat']
    messageBuffer: RunPreparationResult['chatContext']['messageEntities']
    content: string
    modelContext: RunPreparationResult['runSpec']['modelContext']
    usage?: ITokenUsage
  }
}

export class ChatAgentAdapter {
  constructor(
    private readonly preparationPipeline = new ChatPreparationPipeline(),
    private readonly finalizeService = new ChatFinalizeService(),
    private readonly stepRuntimeContextMapper = new ChatStepRuntimeContextMapper()
  ) {}

  prepareRun(
    input: MainAgentRunInput,
    emitter: RunEventEmitter
  ): Promise<RunPreparationResult> {
    return this.preparationPipeline.prepare(input, emitter).then((prepared) => {
      const chatEventMapper = new ChatEventMapper(emitter)
      const earlyEmittedMessageIds = new Set(prepared.chatContext.earlyEmittedMessageIds ?? [])
      for (const message of prepared.chatContext.createdMessages) {
        if (message.id == null || !earlyEmittedMessageIds.has(message.id)) {
          chatEventMapper.emitMessageCreated(message)
        }
      }

      return prepared
    })
  }

  createStepRuntimeContext(
    chatContext: RunPreparationResult['chatContext']
  ): ChatStepRuntimeContext {
    return this.stepRuntimeContextMapper.map(chatContext)
  }

  async finalizeRun({
    input,
    runSpec,
    chatContext,
    stepResult,
    emitter,
    stepCommitter
  }: FinalizeRunArgs): Promise<FinalizeRunResult> {
    const usage = stepResult.usage ?? stepCommitter.getLastUsage()
    const updatedAssistantMessage = await this.finalizeService.finalizeAssistantMessage(
      chatContext.chat,
      stepCommitter.getFinalAssistantMessage(),
      usage
    )
    const finalizedChat = this.finalizeService.finalizeChatEntity(
      chatContext.chat,
      input.input.textCtx,
      input.modelRef,
      input.chatModelRef
    )
    const chatEventMapper = new ChatEventMapper(emitter)
    chatEventMapper.emitMessageCreated(updatedAssistantMessage)
    chatEventMapper.emitChatUpdated(finalizedChat)

    return {
      runResult: {
        userMessageId: chatContext.createdMessages[0]?.id,
        assistantMessageId: updatedAssistantMessage.id,
        usage,
        state: 'completed'
      },
      postRunInput: {
        submissionId: input.submissionId,
        chatEntity: finalizedChat,
        messageBuffer: [...chatContext.messageEntities, updatedAssistantMessage],
        content: input.input.textCtx,
        modelContext: runSpec.modelContext,
        usage
      }
    }
  }

  async abortRun({
    chatContext,
    emitter,
    stepCommitter,
    submissionId,
    reason = 'user_cancelled'
  }: AbortRunArgs): Promise<void> {
    const finalAssistantMessage = stepCommitter.getFinalAssistantMessage()
    const settledAssistantMessage = await this.finalizeService.settleAbortedAssistantMessage(
      chatContext.chat,
      finalAssistantMessage,
      chatContext.messageEntities
    )
    if (settledAssistantMessage) {
      new ChatEventMapper(emitter).emitMessageCreated(settledAssistantMessage)
    }

    const boundaryMessage = this.finalizeService.createRunStoppedBoundaryMessage(
      chatContext.chat,
      finalAssistantMessage,
      {
        submissionId,
        reason
      }
    )
    new ChatEventMapper(emitter).emitMessageCreated(boundaryMessage)
  }
}
