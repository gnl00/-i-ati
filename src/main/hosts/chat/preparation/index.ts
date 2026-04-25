import { RunEnvironmentService } from './RunEnvironmentService'
import { RunRequestFactory } from './RunRequestFactory'
import { StepBootstrapService } from './StepBootstrapService'
import type { RunEventEmitter } from '@main/orchestration/chat/run/infrastructure'
import type { MainAgentRunInput, RunPreparationResult } from './types'

export class ChatPreparationPipeline {
  constructor(
    private readonly runEnvironmentService = new RunEnvironmentService(),
    private readonly stepBootstrapService = new StepBootstrapService(),
    private readonly runRequestFactory = new RunRequestFactory()
  ) {}

  async prepare(
    input: MainAgentRunInput,
    emitter: RunEventEmitter
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
        createdMessages: [step.messageBuffer[step.messageBuffer.length - 1]],
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
  RunPreparationResult,
  StepBootstrap
} from './types'
