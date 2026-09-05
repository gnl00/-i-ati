import type { AgentRequestSpec } from '@main/agent/runtime/request/AgentRequestSpec'
import type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'
import { DefaultAgentEventBus } from '@main/agent/runtime/events/AgentEventBus'
import { DefaultAgentLoop } from '@main/agent/runtime/loop/AgentLoop'
import { DefaultAgentLoopDependenciesFactory } from '@main/agent/runtime/AgentLoopDependenciesFactory'
import { DefaultAgentRuntime } from '@main/agent/runtime/AgentRuntime'
import { createDefaultRuntimeInfrastructure } from '@main/agent/runtime/RuntimeInfrastructure'
import { MainAgentLoopInputBootstrapper } from '@main/hosts/chat/runtime/MainAgentLoopInputBootstrapper'
import type { CliChatProfile } from './CliChatProfile'
import { DefaultInitialTranscriptMaterializer } from '@main/agent/runtime/transcript/InitialTranscriptMaterializer'
import { DefaultUserRecordMaterializer } from '@main/agent/runtime/transcript/UserRecordMaterializer'
import { DefaultToolBatchAssembler } from '@main/agent/runtime/tools/ToolBatchAssembler'
import type { ToolExecutionProgressContext } from '@main/agent/runtime/tools/ToolExecutorDispatcher'
import type { AgentLoopResult } from '@main/agent/runtime/loop/AgentLoopResult'
import type { ToolCallProps } from '@main/agent/contracts'
import { ToolExecutor, type ToolExecutionResult, type ToolExecutorConfig } from '@main/agent/tools'
import type { CliApprovalMode } from '@main/hosts/cli/CliInputAdapter'

export interface CliRuntimeRunInput {
  runId: string
  instruction: string
  workspace: string
  chatUuid: string
  approval: CliApprovalMode
  maxSteps: number
  profile: CliChatProfile
  eventSink: AgentEventSink
  signal: AbortSignal
}

const confirmationRequester = (
  approval: CliApprovalMode
): ToolExecutorConfig['requestConfirmation'] => async () => (
  approval === 'auto'
    ? { approved: true }
    : { approved: false, reason: 'CLI approval mode deny rejected this operation' }
)

export const runCliRuntime = async (input: CliRuntimeRunInput): Promise<AgentLoopResult> => {
  const runtimeInfrastructure = createDefaultRuntimeInfrastructure()
  const eventBus = new DefaultAgentEventBus()
  eventBus.register(input.eventSink)

  const executeToolCalls = async (
    calls: ToolCallProps[],
    context: ToolExecutionProgressContext
  ): Promise<ToolExecutionResult[]> => {
    const executor = new ToolExecutor({
      signal: input.signal,
      chatUuid: input.chatUuid,
      workspaceRoot: input.workspace,
      submissionId: input.runId,
      modelRef: input.profile.modelRef,
      approvalPolicy: {
        mode: 'strict',
        permissionApprovalMode: input.approval === 'auto' ? 'auto' : 'manual'
      },
      onProgress: context.onProgress,
      requestConfirmation: confirmationRequester(input.approval)
    })
    return executor.execute(calls)
  }

  const runtime = new DefaultAgentRuntime({
    requestSpecSource: {
      resolve: (): AgentRequestSpec => input.profile.requestSpec
    },
    runDescriptorSource: {
      create: (): { runId: string } => ({ runId: input.runId })
    },
    loopInputBootstrapper: new MainAgentLoopInputBootstrapper(),
    userRecordMaterializer: new DefaultUserRecordMaterializer(),
    initialTranscriptMaterializer: new DefaultInitialTranscriptMaterializer(),
    runtimeInfrastructure,
    agentLoop: new DefaultAgentLoop(),
    agentLoopDependenciesFactory: new DefaultAgentLoopDependenciesFactory({
      agentEventBus: eventBus,
      toolBatchAssembler: new DefaultToolBatchAssembler(
        runtimeInfrastructure.loopIdentityProvider,
        { resolveConfirmationPolicy: (): { mode: 'not_required' } => ({ mode: 'not_required' }) }
      ),
      executeToolCalls,
      abortedResultDisposition: 'non_terminal',
      toolResultNormalizationScopeId: 'cli'
    })
  })

  return runtime.run({
    hostRequest: {
      hostType: 'cli',
      hostRequestId: input.runId,
      submittedAt: Date.now(),
      userContent: [{ type: 'input_text', text: input.instruction }],
      metadata: { initialTranscriptSeed: input.profile.initialTranscriptSeed }
    },
    execution: {
      maxSteps: input.maxSteps
    },
    signal: input.signal
  })
}
