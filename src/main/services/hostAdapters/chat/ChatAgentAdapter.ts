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
  messageManager: {
    flushPendingAssistantUpdate(): void
    getLastAssistantMessage(): MessageEntity
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
    messageManager
  }: FinalizeRunArgs): Promise<FinalizeRunResult> {
    messageManager.flushPendingAssistantUpdate()

    const assistantMessageId = await this.finalizeService.finalizeAssistantMessage(
      chatContext.assistantPlaceholder,
      messageManager.getLastAssistantMessage()
    )
    const finalizedChat = this.finalizeService.finalizeChatEntity(
      chatContext.chat,
      input.input.textCtx,
      input.modelRef
    )
    new ChatEventMapper(emitter).emitChatUpdated(finalizedChat)

    return {
      runResult: {
        userMessageId: chatContext.createdMessages[0]?.id,
        assistantMessageId,
        usage: stepResult.usage ?? messageManager.getLastUsage(),
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
}
