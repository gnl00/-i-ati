import type { RunResult, StepResult } from '@main/services/agentCore/types'
import { ChatFinalizeService } from './finalize/ChatFinalizeService'
import { ChatEventMapper, ChatStepRuntimeContextMapper, type ChatStepRuntimeContext } from './mapping'
import type { MainChatRunInput, RunPreparationResult } from './preparation'
import { ChatPreparationPipeline } from './preparation'
import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'

type FinalizeRunArgs = {
  input: MainChatRunInput
  runSpec: RunPreparationResult['runSpec']
  chatContext: RunPreparationResult['chatContext']
  stepResult: StepResult
  emitter: ChatRunEventEmitter
  stepCommitter: {
    getFinalAssistantMessage(): MessageEntity
    getLastUsage(): ITokenUsage | undefined
  }
}

type FinalizeRunResult = {
  runResult: RunResult
  postRunInput: {
    submissionId: string
    chatEntity: RunPreparationResult['chatContext']['chat']
    messageBuffer: RunPreparationResult['chatContext']['messageEntities']
    content: string
    modelContext: RunPreparationResult['runSpec']['modelContext']
  }
}

export class ChatAgentAdapter {
  constructor(
    private readonly preparationPipeline = new ChatPreparationPipeline(),
    private readonly finalizeService = new ChatFinalizeService(),
    private readonly stepRuntimeContextMapper = new ChatStepRuntimeContextMapper()
  ) {}

  prepareRun(
    input: MainChatRunInput,
    emitter: ChatRunEventEmitter
  ): Promise<RunPreparationResult> {
    return this.preparationPipeline.prepare(input, emitter).then((prepared) => {
      const chatEventMapper = new ChatEventMapper(emitter)

      chatEventMapper.emitChatReady(
        prepared.chatContext.chat,
        prepared.chatContext.workspacePath
      )
      if (prepared.chatContext.historyMessages.length > 0) {
        chatEventMapper.emitMessagesLoaded(prepared.chatContext.historyMessages)
      }
      for (const message of prepared.chatContext.createdMessages) {
        chatEventMapper.emitMessageCreated(message)
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
    const updatedAssistantMessage = await this.finalizeService.finalizeAssistantMessage(
      chatContext.assistantPlaceholder,
      stepCommitter.getFinalAssistantMessage()
    )
    const finalizedChat = this.finalizeService.finalizeChatEntity(
      chatContext.chat,
      input.input.textCtx,
      input.modelRef
    )
    const chatEventMapper = new ChatEventMapper(emitter)
    chatEventMapper.emitMessageUpdated(updatedAssistantMessage)
    chatEventMapper.emitChatUpdated(finalizedChat)

    return {
      runResult: {
        userMessageId: chatContext.createdMessages[0]?.id,
        assistantMessageId: updatedAssistantMessage.id,
        usage: stepResult.usage ?? stepCommitter.getLastUsage(),
        state: 'completed'
      },
      postRunInput: {
        submissionId: input.submissionId,
        chatEntity: finalizedChat,
        messageBuffer: chatContext.messageEntities,
        content: input.input.textCtx,
        modelContext: runSpec.modelContext
      }
    }
  }

  async abortRun({
    chatContext,
    stepCommitter
  }: Pick<FinalizeRunArgs, 'chatContext' | 'stepCommitter'>): Promise<void> {
    await this.finalizeService.settleAbortedAssistantMessage(
      chatContext.assistantPlaceholder,
      stepCommitter.getFinalAssistantMessage()
    )
  }
}
