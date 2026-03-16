import { RunEnvironmentService } from './RunEnvironmentService'
import { RunRequestFactory } from './RunRequestFactory'
import { StepBootstrapService } from './StepBootstrapService'
import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'
import type { MainChatRunInput, RunPreparationResult } from './types'

export class ChatPreparationPipeline {
  constructor(
    private readonly runEnvironmentService = new RunEnvironmentService(),
    private readonly stepBootstrapService = new StepBootstrapService(),
    private readonly runRequestFactory = new RunRequestFactory()
  ) {}

  async prepare(
    input: MainChatRunInput,
    emitter: ChatRunEventEmitter
  ): Promise<RunPreparationResult> {
    const environment = await this.runEnvironmentService.prepare(input, emitter)
    const step = this.stepBootstrapService.bootstrap(environment, input, emitter)
    const request = await this.runRequestFactory.build(environment, step, input.input)

    return {
      runSpec: {
        submissionId: input.submissionId,
        modelContext: environment.modelContext,
        request,
        initialMessages: step.messageBuffer.map(entity => entity.body),
        runtimeContext: {
          chatId: environment.chat.id,
          chatUuid: environment.chat.uuid,
          workspacePath: environment.workspacePath
        }
      },
      chatContext: {
        chat: environment.chat,
        workspacePath: environment.workspacePath,
        historyMessages: environment.historyMessages,
        createdMessages: [step.messageBuffer[step.messageBuffer.length - 2], step.messageBuffer[step.messageBuffer.length - 1]],
        messageEntities: step.messageBuffer,
        assistantPlaceholder: step.assistantPlaceholder
      }
    }
  }
}

export { RunEnvironmentService } from './RunEnvironmentService'
export { StepBootstrapService } from './StepBootstrapService'
export { RunRequestFactory } from './RunRequestFactory'
export type {
  ChatRunContext,
  ChatRunInputState,
  MainChatRunInput,
  RunEnvironment,
  RunPreparationResult,
  StepBootstrap
} from './types'
