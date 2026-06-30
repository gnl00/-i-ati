import { ToolExecutor, type ToolExecutorConfig } from '@main/agent/tools'
import type { ToolCallProps } from '@main/agent/contracts'
import { DefaultAgentEventBus } from '@main/agent/runtime/events/AgentEventBus'
import { DefaultAgentRuntime } from '@main/agent/runtime/AgentRuntime'
import { DefaultAgentLoopDependenciesFactory } from '@main/agent/runtime/AgentLoopDependenciesFactory'
import { createDefaultRuntimeInfrastructure } from '@main/agent/runtime/RuntimeInfrastructure'
import { DefaultInitialTranscriptMaterializer } from '@main/agent/runtime/transcript/InitialTranscriptMaterializer'
import { DefaultUserRecordMaterializer } from '@main/agent/runtime/transcript/UserRecordMaterializer'
import { DefaultToolBatchAssembler } from '@main/agent/runtime/tools/ToolBatchAssembler'
import { DefaultAgentLoop } from '@main/agent/runtime/loop/AgentLoop'
import type { ModelStreamExecutor } from '@main/agent/runtime/model/ModelStreamExecutor'
import {
  ChatToolSideEffectSink,
  ChatRenderResponder,
  DefaultMainAgentHostRequestBuilder,
  MainAgentLoopInputBootstrapper
} from '@main/hosts/chat/runtime'
import { ChatLoadedSkillsTranscriptContextProvider } from '@main/hosts/chat/runtime/LoadedSkillsTranscriptContextProvider'
import { HostRenderEventForwarder } from '@main/hosts/shared/render'
import { normalizePermissionApprovalMode } from '@tools/approval'
import { DefaultAgentRunCompletionAdapter } from './AgentRunCompletionAdapter'
import type {
  MainAgentRuntimeRunner,
  MainAgentRuntimeRunnerInput,
  MainAgentRuntimeRunResult
} from './MainAgentRuntimeRunner'

const DEFAULT_MAIN_AGENT_EXECUTION = {
  softMaxSteps: 25,
  hardMaxSteps: 80,
  extensionStepSize: 5
} as const

export class DefaultMainAgentRuntimeRunner implements MainAgentRuntimeRunner {
  constructor(
    private readonly hostRequestBuilder = new DefaultMainAgentHostRequestBuilder(),
    private readonly completionAdapter = new DefaultAgentRunCompletionAdapter(),
    private readonly options: {
      modelStreamExecutor?: ModelStreamExecutor
    } = {}
  ) {}

  async run(input: MainAgentRuntimeRunnerInput): Promise<MainAgentRuntimeRunResult> {
    const runtimeInfrastructure = createDefaultRuntimeInfrastructure()
    const submittedAt = runtimeInfrastructure.runtimeClock.now()
    const hostRequest = this.hostRequestBuilder.build({
      runInput: input.runInput,
      prepared: input.prepared,
      submittedAt
    })

    const eventBus = new DefaultAgentEventBus()
    const chatResponder = new ChatRenderResponder(
      input.emitter,
      input.prepared.chatContext.messageEntities,
      input.prepared.chatContext.assistantDraft
    )
    eventBus.register(new HostRenderEventForwarder([
      chatResponder,
      new ChatToolSideEffectSink({
        emitter: input.emitter,
        chatUuid: input.prepared.runSpec.runtimeContext.chatUuid
      }),
      ...(input.hostRenderSinks || [])
    ]))

    const runtime = new DefaultAgentRuntime({
      requestSpecSource: {
        resolve: () => input.prepared.runSpec.requestSpec
      },
      runDescriptorSource: {
        create: () => ({
          runId: `main-agent:${input.runInput.submissionId}`
        })
      },
      loopInputBootstrapper: new MainAgentLoopInputBootstrapper(),
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
        executeToolCalls: (calls, context) => this.executeToolCalls(calls, input, context.onProgress),
        toolResultNormalizationScopeId: input.prepared.runSpec.runtimeContext.chatUuid,
        loadedSkillsTranscriptContextProvider: new ChatLoadedSkillsTranscriptContextProvider(
          input.prepared.runSpec.runtimeContext.chatId
        ),
        abortedResultDisposition: 'non_terminal'
      })
    })

    const result = await runtime.run({
      hostRequest,
      execution: DEFAULT_MAIN_AGENT_EXECUTION,
      signal: input.signal
    })

    return {
      runtimeResult: this.completionAdapter.adapt({
        result
      }),
      stepCommitter: chatResponder
    }
  }

  private async executeToolCalls(
    calls: ToolCallProps[],
    input: MainAgentRuntimeRunnerInput,
    onProgress?: ToolExecutorConfig['onProgress']
  ) {
    const permissionApprovalMode = normalizePermissionApprovalMode(
      input.runtimeContext?.getPermissionApprovalMode()
        ?? input.runInput.input.permissionApprovalMode
        ?? input.prepared.chatContext.chat.permissionApprovalMode
    )

    const toolExecutor = new ToolExecutor({
      maxConcurrency: 3,
      signal: input.signal,
      chatUuid: input.prepared.runSpec.runtimeContext.chatUuid,
      submissionId: input.prepared.runSpec.submissionId,
      modelRef: {
        accountId: input.prepared.runSpec.modelContext.account.id,
        modelId: input.prepared.runSpec.modelContext.model.id
      },
      approvalPolicy: {
        mode: 'strict',
        permissionApprovalMode
      },
      onProgress,
      requestConfirmation: (request) => input.toolConfirmationRequester.request(request)
    })

    return toolExecutor.execute(calls)
  }
}
