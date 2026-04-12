/**
 * AgentLoop
 *
 * 放置内容：
 * - 当前 runtime 架构中的核心 loop orchestrator
 * - 负责 request -> stream -> parse -> tools -> model continuation 的循环
 * - 只读写 runtime-native state，不直接操作 chat message
 *
 * 业务逻辑边界：
 * - 输入：AgentLoopInput，以及由 runtime 组装好的 `AgentLoopDependencies`
 * - 输出：AgentLoopResult
 * - 对外只通过 events 广播 step 事实
 *
 * 约束：
 * - 不直接依赖 hosts/chat
 * - 不直接依赖 chatRun/runtime
 * - 不直接依赖 MessageEntity / DatabaseService
 * - 不直接返回 host-facing output
 */
import { createLogger } from '@main/logging/LogService'
import type { AgentLoopDependencies } from './AgentLoopDependencies'
import type { AgentLoopInput } from './AgentLoopInput'
import type {
  AgentLoopFailureInfo,
  AgentLoopResult,
  CompletedAgentLoopResult,
  FailedAgentLoopResult,
  AbortedAgentLoopResult
} from './AgentLoopResult'
import type { AgentStep, AgentStepFailureInfo } from '../step/AgentStep'
import type { AgentStepDraft, AgentStepDraftDelta } from '../step/AgentStepDraft'
import { createInitialModelResponseParserState } from '../model/ModelResponseParser'
import type { AgentTranscript } from '../transcript/AgentTranscript'
import type { ToolCallReadyFact } from '../tools/ToolCallReadyFact'
import type { ToolResultFact } from '../tools/ToolResultFact'
import type { LoopBudgetProgressSignal } from './LoopBudgetPolicy'

const logger = createLogger('AgentRuntimeLoop')

export interface AgentLoop {
  run(input: AgentLoopInput, dependencies: AgentLoopDependencies): Promise<AgentLoopResult>
}

const mergeUsage = (
  previous: ITokenUsage | undefined,
  next: ITokenUsage | undefined
): ITokenUsage | undefined => {
  if (!previous) return next
  if (!next) return previous
  return {
    promptTokens: previous.promptTokens + next.promptTokens,
    completionTokens: previous.completionTokens + next.completionTokens,
    totalTokens: previous.totalTokens + next.totalTokens
  }
}

const isAbortError = (error: unknown, signal?: AbortSignal): boolean => (
  Boolean(signal?.aborted)
  || (error instanceof Error && error.name === 'AbortError')
)

const toFailureInfo = (error: unknown): AgentLoopFailureInfo => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    }
  }

  return {
    message: String(error)
  }
}

const toStepFailureInfo = (error: unknown): AgentStepFailureInfo => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    }
  }

  return {
    message: String(error)
  }
}

const cloneToolCall = (toolCall: IToolCall): IToolCall => ({
  ...toolCall,
  function: {
    ...toolCall.function
  }
})

const createDraft = (
  stepId: string,
  stepIndex: number,
  startedAt: number
): AgentStepDraft => ({
  stepId,
  stepIndex,
  status: 'streaming',
  startedAt,
  updatedAt: startedAt,
  deltas: [],
  snapshot: {
    content: '',
    toolCalls: []
  }
})

const upsertToolCall = (toolCalls: IToolCall[], toolCall: IToolCall): IToolCall[] => {
  const next = toolCalls.map(cloneToolCall)
  const index = next.findIndex(candidate =>
    candidate.id === toolCall.id
    || (toolCall.index !== undefined && candidate.index === toolCall.index)
  )
  if (index >= 0) {
    next[index] = cloneToolCall(toolCall)
    return next
  }
  next.push(cloneToolCall(toolCall))
  return next
}

const applyDeltaToDraft = (
  draft: AgentStepDraft,
  delta: AgentStepDraftDelta,
  toolCallsSnapshot: IToolCall[]
): AgentStepDraft => {
  const nextSnapshot = {
    ...draft.snapshot,
    toolCalls: toolCallsSnapshot.map(cloneToolCall)
  }

  switch (delta.type) {
    case 'content_delta':
      nextSnapshot.content += delta.content
      break
    case 'reasoning_delta':
      nextSnapshot.reasoning = `${nextSnapshot.reasoning || ''}${delta.reasoning}`
      break
    case 'tool_call_ready':
      nextSnapshot.toolCalls = upsertToolCall(nextSnapshot.toolCalls, delta.toolCall)
      break
    case 'finish_reason':
      nextSnapshot.finishReason = delta.finishReason
      break
    case 'usage_delta':
      nextSnapshot.usage = delta.usage
      break
    case 'response_metadata':
      nextSnapshot.responseId = delta.responseId ?? nextSnapshot.responseId
      nextSnapshot.model = delta.model ?? nextSnapshot.model
      break
    case 'tool_call_started':
      break
  }

  return {
    ...draft,
    updatedAt: delta.timestamp,
    deltas: [...draft.deltas, delta],
    snapshot: nextSnapshot
  }
}

const collectReadyToolCallFacts = (
  step: AgentStep
): ToolCallReadyFact[] => (
  step.toolCalls.map(toolCall => ({
    toolCall: cloneToolCall(toolCall)
  }))
)

const collectProgressSignalsFromDelta = (
  delta: AgentStepDraftDelta
): LoopBudgetProgressSignal[] => {
  switch (delta.type) {
    case 'tool_call_ready':
      return [{ kind: 'tool_call' }]
    default:
      return []
  }
}

const collectBudgetProgressSources = (
  signals: LoopBudgetProgressSignal[],
  toolResults?: ToolResultFact[]
): string[] => {
  const sources = new Set<string>()

  for (const signal of signals) {
    sources.add(signal.kind)
  }

  if (toolResults?.length) {
    sources.add('tool_result')
  }

  return Array.from(sources)
}

export class DefaultAgentLoop implements AgentLoop {
  async run(
    input: AgentLoopInput,
    dependencies: AgentLoopDependencies
  ): Promise<AgentLoopResult> {
    const startedAt = dependencies.runtimeClock.now()
    let budgetState = dependencies.loopBudgetPolicy.initialize(input.execution)
    let transcript = input.transcript
    let usage: ITokenUsage | undefined
    let lastStableStep: AgentStep | undefined
    let budgetExtensionCount = 0
    let lastBudgetProgressSources: string[] = []
    let stepIndex = 0

    while (
      stepIndex < budgetState.hardMaxSteps
      && dependencies.loopBudgetPolicy.canStartStep(stepIndex, budgetState)
    ) {
      if (input.signal?.aborted) {
        return this.finalizeAborted({
          startedAt,
          completedAt: dependencies.runtimeClock.now(),
          transcript,
          usage,
          abortReason: 'Loop aborted before next step started',
          dependencies,
          finalStep: lastStableStep
        })
      }

      const stepId = dependencies.loopIdentityProvider.nextStepId()
      const stepStartedAt = dependencies.runtimeClock.now()
      let draft = createDraft(stepId, stepIndex, stepStartedAt)
      let latestRaw: unknown
      const progressSignals: LoopBudgetProgressSignal[] = []

      await dependencies.agentEventEmitter.emitStepStarted({
        stepId,
        stepIndex,
        timestamp: stepStartedAt
      })

      try {
        const request = dependencies.requestMaterializer.materialize({
          transcript,
          requestSpec: input.requestSpec
        })
        const executableRequest = dependencies.executableRequestAdapter.adapt(request)
        const responseStream = await dependencies.modelStreamExecutor.execute({
          request: executableRequest,
          signal: input.signal
        })
        let parserState = createInitialModelResponseParserState()

        for await (const chunk of responseStream) {
          latestRaw = chunk.raw ?? latestRaw
          if (input.signal?.aborted) {
            return this.finalizeAborted({
              startedAt,
              completedAt: dependencies.runtimeClock.now(),
              transcript,
              usage,
              abortReason: 'Loop aborted during streaming',
              dependencies,
              finalStep: lastStableStep,
              activeStepId: stepId,
              draftDisposition: 'discarded'
            })
          }

          const parsed = dependencies.modelResponseParser.parse({
            chunk,
            state: parserState,
            toolCalls: draft.snapshot.toolCalls
          })

          parserState = parsed.state

          for (const delta of parsed.deltas) {
            draft = applyDeltaToDraft(draft, delta, parsed.toolCallsSnapshot)
            progressSignals.push(...collectProgressSignalsFromDelta(delta))
            await dependencies.agentEventEmitter.emitStepDelta({
              stepId: draft.stepId,
              stepIndex: draft.stepIndex,
              timestamp: delta.timestamp,
              delta,
              snapshot: draft.snapshot
            })
          }
        }
      } catch (error) {
        if (isAbortError(error, input.signal)) {
          return this.finalizeAborted({
            startedAt,
            completedAt: dependencies.runtimeClock.now(),
            transcript,
            usage,
            abortReason: error instanceof Error ? error.message : 'Loop aborted',
            dependencies,
            finalStep: lastStableStep,
            activeStepId: stepId,
            draftDisposition: 'discarded'
          })
        }

        const completedAt = dependencies.runtimeClock.now()
        const failedDraft: AgentStepDraft & { status: 'failed' } = {
          ...draft,
          status: 'failed',
          updatedAt: completedAt
        }
        const failedStep = dependencies.agentStepMaterializer.materialize({
          draft: failedDraft,
          completedAt,
          failure: toStepFailureInfo(error),
          raw: latestRaw
        }) as Extract<AgentStep, { status: 'failed' }>
        await dependencies.agentEventEmitter.emitStepFailed({
          timestamp: completedAt,
          step: failedStep
        })

        return this.finalizeFailed({
          startedAt,
          completedAt,
          transcript,
          usage,
          failure: toFailureInfo(error),
          dependencies,
          finalStep: lastStableStep
        })
      }

      const completedAt = dependencies.runtimeClock.now()
      if (draft.snapshot.toolCalls.length > 0) {
        draft = {
          ...draft,
          status: 'awaiting_tools',
          updatedAt: completedAt
        }
      }

      draft = {
        ...draft,
        status: 'completed',
        updatedAt: completedAt
      }

      const completedDraft: AgentStepDraft & { status: 'completed' } = {
        ...draft,
        status: 'completed'
      }
      const step = dependencies.agentStepMaterializer.materialize({
        draft: completedDraft,
        completedAt,
        raw: latestRaw
      }) as Extract<AgentStep, { status: 'completed' }>
      lastStableStep = step
      usage = mergeUsage(usage, step.usage)

      await dependencies.agentEventEmitter.emitStepCompleted({
        timestamp: completedAt,
        step
      })

      const assistantRecord = dependencies.assistantStepRecordMaterializer.materialize({
        recordId: dependencies.loopIdentityProvider.nextTranscriptRecordId(),
        timestamp: completedAt,
        step
      })
      transcript = dependencies.transcriptAppender.append({
        transcript,
        records: [assistantRecord],
        updatedAt: completedAt
      })

      if (step.toolCalls.length === 0) {
        return this.finalizeCompleted({
          startedAt,
          completedAt,
          transcript,
          usage,
          finalStep: step,
          dependencies
        })
      }

      const readyToolCalls = collectReadyToolCallFacts(step).map(fact => (
        dependencies.readyToolCallMaterializer.materialize({
          stepId: step.stepId,
          fact
        })
      ))
      const batchCreatedAt = dependencies.runtimeClock.now()
      const batch = dependencies.toolBatchAssembler.assemble({
        stepId: step.stepId,
        createdAt: batchCreatedAt,
        readyToolCalls
      })
      const outcome = await dependencies.toolExecutorDispatcher.dispatch(batch)

      if (outcome.status === 'completed') {
        const records = this.materializeToolResultRecords(
          outcome.results,
          dependencies,
          dependencies.runtimeClock.now()
        )
        if (records.length > 0) {
          transcript = dependencies.transcriptAppender.append({
            transcript,
            records,
            updatedAt: dependencies.runtimeClock.now()
          })
        }
        const progressSources = collectBudgetProgressSources(progressSignals, outcome.results)
        const previousSoftMaxSteps = budgetState.softMaxSteps
        budgetState = dependencies.loopBudgetPolicy.extendForProgress(budgetState, {
          step,
          signals: progressSignals,
          toolResults: outcome.results
        })
        if (budgetState.softMaxSteps > previousSoftMaxSteps) {
          budgetExtensionCount += 1
          lastBudgetProgressSources = progressSources
          logger.info('budget.extended', {
            runId: input.run.runId,
            stepId: step.stepId,
            stepIndex: step.stepIndex,
            previousSoftMaxSteps,
            nextSoftMaxSteps: budgetState.softMaxSteps,
            hardMaxSteps: budgetState.hardMaxSteps,
            extensionStepSize: budgetState.extensionStepSize,
            progressSources
          })
        }
        stepIndex += 1
        continue
      }

      if (outcome.partialResults?.length) {
        const records = this.materializeToolResultRecords(
          outcome.partialResults,
          dependencies,
          dependencies.runtimeClock.now()
        )
        if (records.length > 0) {
          transcript = dependencies.transcriptAppender.append({
            transcript,
            records,
            updatedAt: dependencies.runtimeClock.now()
          })
        }
      }

      if (outcome.status === 'aborted') {
        return this.finalizeAborted({
          startedAt,
          completedAt: dependencies.runtimeClock.now(),
          transcript,
          usage,
          abortReason: outcome.abortReason,
          dependencies,
          finalStep: step,
          activeStepId: step.stepId,
          draftDisposition: outcome.partialResults?.length ? 'materialized_partial' : 'discarded'
        })
      }

      return this.finalizeFailed({
        startedAt,
        completedAt: dependencies.runtimeClock.now(),
        transcript,
        usage,
        failure: outcome.failure,
        dependencies,
        finalStep: step
      })
    }

    logger.warn('budget.exhausted', {
      runId: input.run.runId,
      softMaxSteps: budgetState.softMaxSteps,
      hardMaxSteps: budgetState.hardMaxSteps,
      extensionStepSize: budgetState.extensionStepSize,
      budgetExtensionCount,
      lastBudgetProgressSources,
      lastStepId: lastStableStep?.stepId,
      lastStepIndex: lastStableStep?.stepIndex,
      lastStepStatus: lastStableStep?.status
    })

    return this.finalizeFailed({
      startedAt,
      completedAt: dependencies.runtimeClock.now(),
      transcript,
      usage,
      failure: {
        message: `AgentLoop exceeded softMaxSteps=${budgetState.softMaxSteps} (hardMaxSteps=${budgetState.hardMaxSteps})`
      },
      dependencies,
      finalStep: lastStableStep
    })
  }

  private materializeToolResultRecords(
    results: ToolResultFact[],
    dependencies: AgentLoopDependencies,
    timestamp: number
  ) {
    return results.map(result => (
      dependencies.toolResultRecordMaterializer.materialize({
        recordId: dependencies.loopIdentityProvider.nextTranscriptRecordId(),
        timestamp,
        result
      })
    ))
  }

  private async finalizeCompleted(input: {
    startedAt: number
    completedAt: number
    transcript: AgentTranscript
    usage?: ITokenUsage
    finalStep: AgentStep
    dependencies: AgentLoopDependencies
  }): Promise<CompletedAgentLoopResult> {
    const result: CompletedAgentLoopResult = {
      status: 'completed',
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      transcript: input.dependencies.transcriptSnapshotMaterializer.materialize(input.transcript),
      usage: input.usage,
      finalStep: input.finalStep
    }

    await input.dependencies.agentEventEmitter.emitLoopCompleted({
      timestamp: input.completedAt,
      result
    })

    return result
  }

  private async finalizeFailed(input: {
    startedAt: number
    completedAt: number
    transcript: AgentTranscript
    usage?: ITokenUsage
    failure: AgentLoopFailureInfo
    dependencies: AgentLoopDependencies
    finalStep?: AgentStep
  }): Promise<FailedAgentLoopResult> {
    const result: FailedAgentLoopResult = {
      status: 'failed',
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      transcript: input.dependencies.transcriptSnapshotMaterializer.materialize(input.transcript),
      usage: input.usage,
      failure: input.failure,
      finalStep: input.finalStep
    }

    await input.dependencies.agentEventEmitter.emitLoopFailed({
      timestamp: input.completedAt,
      result
    })

    return result
  }

  private async finalizeAborted(input: {
    startedAt: number
    completedAt: number
    transcript: AgentTranscript
    usage?: ITokenUsage
    abortReason: string
    dependencies: AgentLoopDependencies
    finalStep?: AgentStep
    activeStepId?: string
    draftDisposition?: 'discarded' | 'materialized_partial'
  }): Promise<AbortedAgentLoopResult> {
    const result: AbortedAgentLoopResult = {
      status: 'aborted',
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      transcript: input.dependencies.transcriptSnapshotMaterializer.materialize(input.transcript),
      usage: input.usage,
      abortReason: input.abortReason,
      finalStep: input.finalStep
    }

    await input.dependencies.agentEventEmitter.emitLoopAborted({
      timestamp: input.completedAt,
      result,
      activeStepId: input.activeStepId,
      draftDisposition: input.draftDisposition
    })

    return result
  }
}
