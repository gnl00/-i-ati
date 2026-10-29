import { RunEnvironmentService } from './RunEnvironmentService'
import { RunRequestFactory } from './RunRequestFactory'
import { StepBootstrapService } from './StepBootstrapService'
import { ChatEventMapper } from '../mapping'
import type { RunEventEmitter } from '@main/agent/contracts'
import type { MainAgentRunInput, RunPreparationOptions, RunPreparationResult } from './types'

export class ChatPreparationPipeline {
  constructor(
    private readonly runEnvironmentService = new RunEnvironmentService(),
    private readonly stepBootstrapService = new StepBootstrapService(),
    private readonly runRequestFactory = new RunRequestFactory()
  ) {}

  async prepare(
    input: MainAgentRunInput,
    emitter: RunEventEmitter,
    options?: RunPreparationOptions
  ): Promise<RunPreparationResult> {
    options?.signal?.throwIfAborted()
    const environment = await this.runEnvironmentService.prepare(input, emitter, options)
    options?.signal?.throwIfAborted()
    const chatEventMapper = new ChatEventMapper(emitter)
    chatEventMapper.emitChatReady(environment.chat, environment.workspacePath)
    if (environment.historyMessages.length > 0) {
      chatEventMapper.emitMessagesLoaded(environment.historyMessages)
    }
    const step = await this.stepBootstrapService.bootstrap(environment, input, emitter, options?.signal)
    const requestBuild = await this.runRequestFactory.build(environment, step, input.input, options?.signal)
    options?.signal?.throwIfAborted()
    if (options?.systemPrompt)
      requestBuild.requestSpec.systemPrompt = options.systemPrompt
    if (options?.options?.thinking) {
      requestBuild.requestSpec.options = {
        ...requestBuild.requestSpec.options,
        ...options.options
      }
    }
    const createdMessages = step.messageBuffer.slice(environment.historyMessages.length)

    return {
      runSpec: {
        submissionId: input.submissionId,
        modelContext: environment.modelContext,
        requestSpec: requestBuild.requestSpec,
        contextMessages: requestBuild.contextMessages,
        runtimeContext: {
          chatId: environment.chat.id,
          chatUuid: environment.chat.uuid,
          workspacePath: environment.workspacePath
        }
      },
      chatContext: {
        emotionEnabled: requestBuild.emotionEnabled,
        chat: environment.chat,
        workspacePath: environment.workspacePath,
        historyMessages: environment.historyMessages,
        createdMessages,
        earlyEmittedMessageIds: step.earlyEmittedMessageIds,
        messageEntities: step.messageBuffer,
        assistantDraft: step.assistantDraft
      }
    }
  }
}

export { RunEnvironmentService } from './RunEnvironmentService'
export { StepBootstrapService } from './StepBootstrapService'
export { RunRequestFactory } from './RunRequestFactory'
export type {
  ChatHostRunContext,
  HostRunInputState,
  MainAgentRunInput,
  RunEnvironment,
  RunPreparationOptions,
  RunPreparationResult,
  StepBootstrap
} from './types'
