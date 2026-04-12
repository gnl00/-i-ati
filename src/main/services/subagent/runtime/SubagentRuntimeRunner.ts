import { DefaultAgentEventBus } from '@main/agent/runtime/events/AgentEventBus'
import { DefaultLoopInputBootstrapper } from '@main/agent/runtime/host/bootstrap/LoopInputBootstrapper'
import { DefaultAgentLoop } from '@main/agent/runtime/loop/AgentLoop'
import type { LoopRunDescriptorSource } from '@main/agent/runtime/AgentRuntimeContext'
import { DefaultAgentLoopDependenciesFactory } from '@main/agent/runtime/AgentLoopDependenciesFactory'
import { DefaultAgentRuntime, type AgentRuntime } from '@main/agent/runtime/AgentRuntime'
import { createDefaultRuntimeInfrastructure } from '@main/agent/runtime/RuntimeInfrastructure'
import type { LoopExecutionConfig } from '@main/agent/runtime/loop/LoopExecutionConfig'
import type { ModelStreamExecutor } from '@main/agent/runtime/model/ModelStreamExecutor'
import { DefaultInitialTranscriptMaterializer } from '@main/agent/runtime/transcript/InitialTranscriptMaterializer'
import { DefaultUserRecordMaterializer } from '@main/agent/runtime/transcript/UserRecordMaterializer'
import { DefaultToolBatchAssembler } from '@main/agent/runtime/tools/ToolBatchAssembler'
import { ToolExecutor } from '@main/agent/tools'
import type { ToolCallProps } from '@main/agent/contracts'
import type { ResolvedAgentApprovalPolicy } from '@tools/approval'
import type { RunSpec } from '@main/agent/contracts'
import type { ToolExecutorConfig } from '@main/agent/tools'
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

export interface PreparedSubagentRunContext {
  modelContext: RunSpec['modelContext']
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

    const runtime = this.options.runtime ?? new DefaultAgentRuntime({
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
      throw new Error(result.failure.message || 'Subagent runtime failed')
    }

    if (result.status === 'aborted') {
      throw new Error(result.abortReason || 'Subagent runtime aborted')
    }

    return {
      summary: result.finalStep.content.trim(),
      artifacts: eventSink.buildArtifacts()
    }
  }
}
