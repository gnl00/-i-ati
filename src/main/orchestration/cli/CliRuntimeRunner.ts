import type { AgentRequestSpec } from '@main/agent/runtime/request/AgentRequestSpec'
import type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'
import { DefaultAgentEventBus } from '@main/agent/runtime/events/AgentEventBus'
import { DefaultAgentLoop } from '@main/agent/runtime/loop/AgentLoop'
import { DefaultAgentLoopDependenciesFactory } from '@main/agent/runtime/AgentLoopDependenciesFactory'
import { DefaultAgentRuntime } from '@main/agent/runtime/AgentRuntime'
import { createDefaultRuntimeInfrastructure } from '@main/agent/runtime/RuntimeInfrastructure'
import { MainAgentLoopInputBootstrapper } from '@main/hosts/chat/runtime/MainAgentLoopInputBootstrapper'
import type { CliChatProfile } from './CliChatProfile'
import { DefaultToolBatchAssembler } from '@main/agent/runtime/tools/ToolBatchAssembler'
import type { ToolExecutionProgressContext } from '@main/agent/runtime/tools/ToolExecutorDispatcher'
import type { AgentLoopResult } from '@main/agent/runtime/loop/AgentLoopResult'
import type { ToolCallProps } from '@main/agent/contracts'
import { ToolExecutor, type ToolExecutionResult, type ToolExecutorConfig } from '@main/agent/tools'
import type { CliApprovalMode } from '@main/hosts/cli/CliInputAdapter'
import type { RunEventEmitter } from '@main/agent/contracts'
import { subagentRuntimeBridge } from '@main/services/subagent/subagent-runtime-bridge'
import subagentRunService from '@main/services/subagent/subagent-run-service'

export interface CliRuntimeRunInput {
  runId: string
  instruction: string
  workspace: string
  chatUuid: string
  approval: CliApprovalMode
  maxSteps: number
  profile: CliChatProfile
  eventSink: AgentEventSink & { emit?: (type: string, payload: Record<string, unknown>) => Promise<void> }
  signal: AbortSignal
}

const confirmationRequester =
  (approval: CliApprovalMode): ToolExecutorConfig['requestConfirmation'] =>
  async () =>
    approval === 'auto'
      ? { approved: true }
      : {
          approved: false,
          reason: 'CLI approval mode deny rejected this operation'
        }

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
    runtimeInfrastructure,
    agentLoop: new DefaultAgentLoop(),
    agentLoopDependenciesFactory: new DefaultAgentLoopDependenciesFactory({
      agentEventBus: eventBus,
      toolResultWorkspaceRoot: input.workspace,
      toolBatchAssembler: new DefaultToolBatchAssembler(
        runtimeInfrastructure.loopIdentityProvider,
        {
          resolveConfirmationPolicy: (): { mode: 'not_required' } => ({
            mode: 'not_required'
          })
        }
      ),
      executeToolCalls,
      abortedResultDisposition: 'non_terminal'
    })
  })

  const emitter: RunEventEmitter = {
    submissionId: input.runId,
    chatUuid: input.chatUuid,
    setChatMeta: () => {},
    emit: (type, payload) => {
      void input.eventSink.emit?.(type, payload as Record<string, unknown>)
        .catch(error => console.warn('[CLI] Child status delivery failed:', error))
    }
  }
  subagentRuntimeBridge.register(input.runId, {
    emitter,
    requestSpec: input.profile.requestSpec,
    modelRef: input.profile.modelRef,
    requester: { request: confirmationRequester(input.approval)! },
    cancelConfirmation: () => {} // CLI approvals resolve immediately; no pending interaction exists.
  })
  const onAbort = (): void => subagentRunService.cancelForParent(input.runId)
  input.signal.addEventListener('abort', onAbort, { once: true })
  try {
    const result = await runtime.run({
      hostRequest: {
        hostType: 'cli',
        hostRequestId: input.runId,
        submittedAt: Date.now(),
        userContent: [{ type: 'input_text', text: input.instruction }],
        metadata: { contextMessages: input.profile.contextMessages }
      },
      execution: {
        maxSteps: input.maxSteps
      },
      signal: input.signal
    })
    if (result.status !== 'completed') onAbort()
    return result
  } catch (error) {
    onAbort()
    throw error
  } finally {
    input.signal.removeEventListener('abort', onAbort)
    subagentRuntimeBridge.releaseParent(input.runId)
  }
}
