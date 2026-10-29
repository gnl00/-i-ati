import { isAbsolute } from 'node:path'
import { resolveWorkspaceRoot } from '@main/services/filesystem/WorkspacePathResolver'
import { DefaultAgentEventBus } from '@main/agent/runtime/events/AgentEventBus'
import { DefaultLoopInputBootstrapper } from '@main/agent/runtime/host/bootstrap/LoopInputBootstrapper'
import { DefaultAgentLoop } from '@main/agent/runtime/loop/AgentLoop'
import type { LoopRunDescriptorSource } from '@main/agent/runtime/AgentRuntimeContext'
import { DefaultAgentLoopDependenciesFactory } from '@main/agent/runtime/AgentLoopDependenciesFactory'
import { DefaultAgentRuntime, type AgentRuntime } from '@main/agent/runtime/AgentRuntime'
import { createDefaultRuntimeInfrastructure } from '@main/agent/runtime/RuntimeInfrastructure'
import type { LoopExecutionConfig } from '@main/agent/runtime/loop/LoopExecutionConfig'
import type { ModelStreamExecutor } from '@main/agent/runtime/model/ModelStreamExecutor'
import { DefaultToolBatchAssembler } from '@main/agent/runtime/tools/ToolBatchAssembler'
import { ToolExecutor } from '@main/agent/tools'
import type { ToolCallProps } from '@main/agent/contracts'
import { normalizePermissionApprovalMode, type ResolvedAgentApprovalPolicy } from '@tools/approval'
import type { RunSpec } from '@main/agent/contracts'
import type { ToolExecutorConfig } from '@main/agent/tools'
import { DefaultSubagentHostRunRequestBuilder } from './SubagentHostRunRequestBuilder'
import { SubagentRequestSpecSource } from './SubagentRequestSpecSource'
import { SubagentAgentEventSink } from './SubagentAgentEventSink'
import { restoreSubagentHistory } from './SubagentHistory'
import type { AgentLoopInput } from '@main/agent/runtime/loop/AgentLoopInput'
import type { AgentRequestSpec } from '@main/agent/runtime/request/AgentRequestSpec'
import type { AgentSteeringMessage } from '@main/agent/runtime/steering/SteeringMessageSource'
import { subagentRuntimeBridge } from '../subagent-runtime-bridge'
import { waitForCommandProcessCleanup } from '@main/services/command/CommandProcessRunner'
import type { SubagentExecutionResult, SubagentSpawnInput } from '../types'

const SUBAGENT_APPROVAL_POLICY: ResolvedAgentApprovalPolicy = {
  mode: 'relaxed'
}

const DEFAULT_SUBAGENT_EXECUTION: LoopExecutionConfig = {
  maxSteps: 80
}

export interface PreparedSubagentRunContext {
  modelContext?: RunSpec['modelContext']
  requestSpec?: AgentRequestSpec
  systemPrompt: string
  userMessage: string
  allowedTools: string[]
  workspacePath: string
}

export interface SubagentRuntimeRunner {
  run(
    input: SubagentSpawnInput,
    context: PreparedSubagentRunContext
  ): Promise<SubagentExecutionResult>
}

export const createSubagentConfirmationRequester = (
  input: Pick<SubagentSpawnInput, 'subagentId' | 'role' | 'task' | 'parentSubmissionId' | 'signal'>
): ToolExecutorConfig['requestConfirmation'] => {
  if (!input.parentSubmissionId) {
    return async () => ({
      approved: false,
      reason: 'Parent confirmation channel unavailable.'
    })
  }

  return async (request) =>
    subagentRuntimeBridge.request(input.parentSubmissionId!, {
      ...request,
      agent: request.agent ?? {
        kind: 'subagent',
        subagentId: input.subagentId,
        role: input.role,
        task: input.task
      }
    }, input.signal)
}

export class DefaultSubagentRuntimeRunner implements SubagentRuntimeRunner {
  constructor(
    private readonly hostRunRequestBuilder = new DefaultSubagentHostRunRequestBuilder(),
    private readonly options: {
      modelStreamExecutor?: ModelStreamExecutor
      runtime?: AgentRuntime
    } = {}
  ) {}

  async run(
    input: SubagentSpawnInput,
    context: PreparedSubagentRunContext
  ): Promise<SubagentExecutionResult> {
    const submittedAt = Date.now()
    const hostRequest = this.hostRunRequestBuilder.build(input, context.userMessage, submittedAt)
    const eventBus = new DefaultAgentEventBus()
    const eventSink = new SubagentAgentEventSink()
    eventBus.register(eventSink)

    const runDescriptorSource: LoopRunDescriptorSource = {
      create: () => ({
        runId: input.runId ?? `subagent:${input.subagentId || hostRequest.hostRequestId}`
      })
    }

    const confirmationSource = {
      kind: 'subagent' as const,
      subagentId: input.subagentId,
      role: input.role,
      task: input.task
    }

    const requestConfirmation = createSubagentConfirmationRequester(input)

    const executeToolCalls = async (
      calls: ToolCallProps[],
      executionContext?: { onProgress?: ToolExecutorConfig['onProgress'] }
    ) => {
      const executor = new ToolExecutor({
        chatUuid: input.chatUuid,
        workspaceRoot: context.workspacePath,
        modelRef: input.modelRef,
        submissionId: input.parentSubmissionId,
        signal: input.signal,
        allowedTools: context.allowedTools,
        approvalPolicy: {
          ...SUBAGENT_APPROVAL_POLICY,
          permissionApprovalMode: normalizePermissionApprovalMode(input.permissionApprovalMode)
        },
        confirmationSource,
        onProgress: executionContext?.onProgress,
        requestConfirmation
      })
      return executor.execute(calls)
    }

    const runtimeInfrastructure = createDefaultRuntimeInfrastructure()

    const runtime =
      this.options.runtime ??
      new DefaultAgentRuntime({
        requestSpecSource: new SubagentRequestSpecSource({
          modelContext: context.modelContext,
          requestSpec: context.requestSpec,
          systemPrompt: context.systemPrompt,
          allowedTools: context.allowedTools
        }),
        runDescriptorSource,
        loopInputBootstrapper: {
          bootstrap: (bootstrapInput): AgentLoopInput => {
            const pending: AgentSteeringMessage[] = []
            // Drain the bounded inbox before the first request; later arrivals use loop checkpoints.
            for (let index = 0; index < 16; index++) {
              const message = input.steeringMessageSource?.take()
              if (!message) break
              pending.push(message)
            }
            const initial = new DefaultLoopInputBootstrapper().bootstrap({
              ...bootstrapInput,
              hostRequest: { ...bootstrapInput.hostRequest, userContent: [
                ...bootstrapInput.hostRequest.userContent,
                ...pending.flatMap(message => message.content)
              ] }
            })
            for (const message of pending) input.steeringMessageSource?.acknowledge(message.queueItemId)
            return { ...initial, records: [...restoreSubagentHistory(input.history ?? []), ...initial.records] }
          }
        },
        runtimeInfrastructure,
        agentLoop: new DefaultAgentLoop(),
        agentLoopDependenciesFactory: new DefaultAgentLoopDependenciesFactory({
          signal: input.signal,
          agentEventBus: eventBus,
          steeringMessageSource: input.steeringMessageSource,
          modelStreamExecutor: this.options.modelStreamExecutor,
          toolBatchAssembler: new DefaultToolBatchAssembler(
            runtimeInfrastructure.loopIdentityProvider,
            {
              resolveConfirmationPolicy: () => ({ mode: 'not_required' })
            }
          ),
          executeToolCalls,
          toolResultWorkspaceRoot: isAbsolute(context.workspacePath)
            ? context.workspacePath
            : resolveWorkspaceRoot(input.chatUuid),
          abortedResultDisposition: 'non_terminal'
        })
      })

    let result: Awaited<ReturnType<AgentRuntime['run']>>
    try {
      result = await runtime.run({ hostRequest, execution: DEFAULT_SUBAGENT_EXECUTION, signal: input.signal })
    } catch (error) {
      if (input.signal?.aborted) await waitForCommandProcessCleanup()
      return {
        status: input.signal?.aborted ? 'cancelled' : 'failed',
        error: error instanceof Error ? error.message : String(error),
        summary: eventSink.getPartialSummary(), artifacts: eventSink.buildArtifacts()
      }
    }
    if (input.signal?.aborted) await waitForCommandProcessCleanup()

    return {
      usage: result.usage,
      transcript: result.transcript,
      status: result.status === 'aborted' ? 'cancelled' : result.status,
      error: result.status === 'failed' ? result.failure.message : result.status === 'aborted' ? result.abortReason : undefined,
      summary: result.status === 'completed'
        ? result.finalStep.content.trim()
        : eventSink.getPartialSummary() || result.finalStep?.content.trim() || '',
      artifacts: eventSink.buildArtifacts()
    }
  }
}
