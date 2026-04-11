import { DefaultAgentEventBus } from '@main/services/next/events/AgentEventBus'
import { DefaultLoopInputBootstrapper } from '@main/services/next/host/bootstrap/LoopInputBootstrapper'
import { DefaultAgentLoop } from '@main/services/next/loop/AgentLoop'
import type { LoopRunDescriptorSource } from '@main/services/next/runtime/NextAgentRuntimeContext'
import { DefaultAgentLoopDependenciesFactory } from '@main/services/next/runtime/AgentLoopDependenciesFactory'
import { DefaultNextAgentRuntime, type NextAgentRuntime } from '@main/services/next/runtime/NextAgentRuntime'
import { createDefaultRuntimeInfrastructure } from '@main/services/next/runtime/RuntimeInfrastructure'
import type { LoopExecutionConfig } from '@main/services/next/loop/LoopExecutionConfig'
import type { ModelStreamExecutor } from '@main/services/next/runtime/model/ModelStreamExecutor'
import { DefaultInitialTranscriptMaterializer } from '@main/services/next/transcript/InitialTranscriptMaterializer'
import { DefaultUserRecordMaterializer } from '@main/services/next/transcript/UserRecordMaterializer'
import { DefaultToolBatchAssembler } from '@main/services/next/tools/ToolBatchAssembler'
import { ToolExecutor } from '@main/services/agentCore/tools'
import type { ToolCallProps } from '@main/services/agentCore/types'
import type { ResolvedAgentApprovalPolicy } from '@tools/approval'
import type { RunSpec } from '@main/services/agentCore/types'
import type { ToolExecutorConfig } from '@main/services/agentCore/tools/types'
import { DefaultSubagentHostRunRequestBuilder } from './SubagentHostRunRequestBuilder'
import { SubagentRequestSpecSource } from './SubagentRequestSpecSource'
import { SubagentAgentEventSink } from './SubagentAgentEventSink'
import { subagentRuntimeBridge } from '../subagent-runtime-bridge'
import type { SubagentExecutionResult, SubagentSpawnInput } from '../types'

const SUBAGENT_APPROVAL_POLICY: ResolvedAgentApprovalPolicy = {
  mode: 'relaxed'
}

const DEFAULT_SUBAGENT_EXECUTION: LoopExecutionConfig = {
  softMaxSteps: 25,
  hardMaxSteps: 25
}

export interface PreparedSubagentNextRunContext {
  modelContext: RunSpec['modelContext']
  systemPrompt: string
  userMessage: string
  allowedTools: string[]
  workspacePath: string
}

export interface SubagentNextRuntimeRunner {
  run(
    input: SubagentSpawnInput,
    context: PreparedSubagentNextRunContext
  ): Promise<SubagentExecutionResult>
}

export const createSubagentConfirmationRequester = (
  input: Pick<SubagentSpawnInput, 'subagentId' | 'role' | 'task' | 'parentSubmissionId'>
): ToolExecutorConfig['requestConfirmation'] => {
  if (!input.parentSubmissionId) {
    return async () => ({
      approved: false,
      reason: 'Subagent confirmation flow is not enabled in phase one.'
    })
  }

  return async (request) => subagentRuntimeBridge.request(input.parentSubmissionId!, {
    ...request,
    agent: request.agent ?? {
      kind: 'subagent',
      subagentId: input.subagentId,
      role: input.role,
      task: input.task
    }
  })
}

export class DefaultSubagentNextRuntimeRunner implements SubagentNextRuntimeRunner {
  constructor(
    private readonly hostRunRequestBuilder = new DefaultSubagentHostRunRequestBuilder(),
    private readonly options: {
      modelStreamExecutor?: ModelStreamExecutor
      runtime?: NextAgentRuntime
    } = {}
  ) {}

  async run(
    input: SubagentSpawnInput,
    context: PreparedSubagentNextRunContext
  ): Promise<SubagentExecutionResult> {
    const submittedAt = Date.now()
    const hostRequest = this.hostRunRequestBuilder.build(input, context.userMessage, submittedAt)
    const eventBus = new DefaultAgentEventBus()
    const eventSink = new SubagentAgentEventSink()
    eventBus.register(eventSink)

    const runDescriptorSource: LoopRunDescriptorSource = {
      create: () => ({
        runId: `subagent:${input.subagentId || hostRequest.hostRequestId}`
      })
    }

    const confirmationSource = {
      kind: 'subagent' as const,
      subagentId: input.subagentId,
      role: input.role,
      task: input.task
    }

    const requestConfirmation = createSubagentConfirmationRequester(input)

    const executeToolCalls = async (calls: ToolCallProps[]) => {
      const executor = new ToolExecutor({
        chatUuid: input.chatUuid,
        modelRef: input.modelRef,
        submissionId: input.parentSubmissionId,
        signal: undefined,
        allowedTools: context.allowedTools,
        approvalPolicy: SUBAGENT_APPROVAL_POLICY,
        confirmationSource,
        requestConfirmation
      })
      return executor.execute(calls)
    }

    const runtimeInfrastructure = createDefaultRuntimeInfrastructure()

    const runtime = this.options.runtime ?? new DefaultNextAgentRuntime({
      requestSpecSource: new SubagentRequestSpecSource({
        modelContext: context.modelContext,
        systemPrompt: context.systemPrompt,
        allowedTools: context.allowedTools
      }),
      runDescriptorSource,
      loopInputBootstrapper: new DefaultLoopInputBootstrapper(),
      userRecordMaterializer: new DefaultUserRecordMaterializer(),
      initialTranscriptMaterializer: new DefaultInitialTranscriptMaterializer(),
      runtimeInfrastructure,
      agentLoop: new DefaultAgentLoop(),
      agentLoopDependenciesFactory: new DefaultAgentLoopDependenciesFactory({
        agentEventBus: eventBus,
        modelStreamExecutor: this.options.modelStreamExecutor,
        toolBatchAssembler: new DefaultToolBatchAssembler(
          runtimeInfrastructure.loopIdentityProvider,
          {
            resolveConfirmationPolicy: () => ({ mode: 'not_required' })
          }
        ),
        executeToolCalls,
        abortedResultDisposition: 'non_terminal'
      })
    })

    const result = await runtime.run({
      hostRequest,
      execution: DEFAULT_SUBAGENT_EXECUTION
    })

    if (result.status === 'failed') {
      throw new Error(result.failure.message || 'Subagent next runtime failed')
    }

    if (result.status === 'aborted') {
      throw new Error(result.abortReason || 'Subagent next runtime aborted')
    }

    return {
      summary: result.finalStep.content.trim(),
      artifacts: eventSink.buildArtifacts()
    }
  }
}
