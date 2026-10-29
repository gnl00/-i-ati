import { createLogger } from '@main/logging/LogService'
import { RunEnvironmentService } from './RunEnvironmentService'
import { RunRequestFactory } from './RunRequestFactory'
import { StepBootstrapService } from './StepBootstrapService'
import { ChatEventMapper } from '../mapping'
import type { RunEventEmitter } from '@main/agent/contracts'
import type { MainAgentRunInput, RunPreparationOptions, RunPreparationResult } from './types'

const logger = createLogger('ChatPreparation')

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
    const startedAt = performance.now()
    const durationsMs: Record<string, number> = {}
    let completed = false
    const controller = new AbortController()
    const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
    const measure = async <T>(phase: string, operation: () => Promise<T>): Promise<T> => {
      const start = performance.now()
      try { return await operation() }
      finally { durationsMs[phase] = performance.now() - start }
    }
    try {
      options?.signal?.throwIfAborted()
      const environment = await measure('environment', () => this.runEnvironmentService.prepare(input, emitter, { ...options, signal }))
      options?.signal?.throwIfAborted()
      const chatEventMapper = new ChatEventMapper(emitter)
      chatEventMapper.emitChatReady(environment.chat, environment.workspacePath)
      const stepPromise = measure('bootstrap', () => this.stepBootstrapService.bootstrap(environment, input, emitter, signal))
      const contextPromise = measure('context', () => this.runRequestFactory.prepare(environment, input.input, signal))
      let step: Awaited<typeof stepPromise>
      let context: Awaited<typeof contextPromise>
      try {
        [step, context] = await Promise.all([stepPromise, contextPromise])
      } catch (error) {
        controller.abort(error)
        await Promise.allSettled([stepPromise, contextPromise])
        throw error
      }
      signal.throwIfAborted()
      const requestBuild = await measure('assembly', async () => this.runRequestFactory.build(step, context, signal))
      signal.throwIfAborted()
      if (options?.systemPrompt)
        requestBuild.requestSpec.systemPrompt = options.systemPrompt
      if (options?.options?.thinking) {
        requestBuild.requestSpec.options = {
          ...requestBuild.requestSpec.options,
          ...options.options
        }
      }
      const createdMessages = step.messageBuffer.slice(environment.historyMessages.length)

      completed = true
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
    } finally {
      logger.info('preparation.measured', {
        submissionId: input.submissionId,
        status: completed ? 'completed' : options?.signal?.aborted ? 'aborted' : 'failed',
        durationsMs: { ...durationsMs, total: performance.now() - startedAt }
      })
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
