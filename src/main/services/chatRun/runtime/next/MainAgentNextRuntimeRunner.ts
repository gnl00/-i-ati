import { ToolExecutor } from '@main/services/agent/tools'
import type { ToolCallProps } from '@main/services/agent/contracts'
import { DefaultAgentEventBus } from '@main/services/next/events/AgentEventBus'
import { DefaultNextAgentRuntime } from '@main/services/next/runtime/NextAgentRuntime'
import { DefaultAgentLoopDependenciesFactory } from '@main/services/next/runtime/AgentLoopDependenciesFactory'
import { createDefaultRuntimeInfrastructure } from '@main/services/next/runtime/RuntimeInfrastructure'
import { DefaultInitialTranscriptMaterializer } from '@main/services/next/transcript/InitialTranscriptMaterializer'
import { DefaultUserRecordMaterializer } from '@main/services/next/transcript/UserRecordMaterializer'
import { DefaultToolBatchAssembler } from '@main/services/next/tools/ToolBatchAssembler'
import { DefaultAgentLoop } from '@main/services/next/loop/AgentLoop'
import type { RunPreparationResult } from '@main/services/hostAdapters/chat/preparation/types'
import type { ModelStreamExecutor } from '@main/services/next/runtime/model/ModelStreamExecutor'
import {
  AgentUiAdapter,
  DefaultMainAgentHostRequestBuilder,
  MainAgentLoopInputBootstrapper
} from '@main/services/hostAdapters/chat/next'
import { DefaultAgentRunCompletionAdapter } from './AgentRunCompletionAdapter'
import type {
  MainAgentRuntimeRunner,
  MainAgentRuntimeRunnerInput,
  MainAgentRuntimeRunResult
} from '../MainAgentRuntimeRunner'

const DEFAULT_MAIN_AGENT_EXECUTION = {
  hardMaxSteps: 25
} as const

const toRequestSpec = (prepared: RunPreparationResult['runSpec']) => ({
  adapterPluginId: prepared.modelContext.providerDefinition.adapterPluginId,
  baseUrl: prepared.modelContext.account.apiUrl,
  apiKey: prepared.modelContext.account.apiKey,
  model: prepared.request.model,
  modelType: prepared.request.modelType,
  systemPrompt: prepared.request.systemPrompt,
  userInstruction: prepared.request.userInstruction,
  tools: prepared.request.tools,
  stream: prepared.request.stream,
  requestOverrides: prepared.request.requestOverrides,
  options: prepared.request.options
})

export class DefaultMainAgentNextRuntimeRunner implements MainAgentRuntimeRunner {
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
    const uiAdapter = new AgentUiAdapter(
      input.emitter,
      input.prepared.chatContext.messageEntities,
      input.prepared.chatContext.assistantPlaceholder
    )
    eventBus.register(uiAdapter)

    const runtime = new DefaultNextAgentRuntime({
      requestSpecSource: {
        resolve: () => toRequestSpec(input.prepared.runSpec)
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
        executeToolCalls: (calls) => this.executeToolCalls(calls, input),
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
        result,
        artifacts: uiAdapter.getArtifacts()
      }),
      stepCommitter: uiAdapter
    }
  }

  private async executeToolCalls(
    calls: ToolCallProps[],
    input: MainAgentRuntimeRunnerInput
  ) {
    const toolExecutor = new ToolExecutor({
      maxConcurrency: 3,
      signal: input.signal,
      chatUuid: input.prepared.runSpec.runtimeContext.chatUuid,
      submissionId: input.prepared.runSpec.submissionId,
      modelRef: {
        accountId: input.prepared.runSpec.modelContext.account.id,
        modelId: input.prepared.runSpec.modelContext.model.id
      },
      requestConfirmation: (request) => input.toolConfirmationRequester.request(request)
    })

    return toolExecutor.execute(calls)
  }
}
