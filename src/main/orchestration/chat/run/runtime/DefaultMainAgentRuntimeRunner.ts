import { isAbsolute } from 'node:path'
import { resolveWorkspaceRoot } from '@main/services/filesystem/WorkspacePathResolver'
import { HostOutputDispatcher } from '@main/hosts/shared/output/HostOutputDispatcher'
import { isInteractiveMessageSource } from '@shared/messages/messageSources'
import { ToolExecutor, type ToolExecutorConfig } from '@main/agent/tools'
import type { ToolCallProps } from '@main/agent/contracts'
import { DefaultAgentEventBus } from '@main/agent/runtime/events/AgentEventBus'
import type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'
import { DefaultAgentRuntime } from '@main/agent/runtime/AgentRuntime'
import { DefaultAgentLoopDependenciesFactory } from '@main/agent/runtime/AgentLoopDependenciesFactory'
import { createDefaultRuntimeInfrastructure } from '@main/agent/runtime/RuntimeInfrastructure'
import { DefaultToolBatchAssembler } from '@main/agent/runtime/tools/ToolBatchAssembler'
import { DefaultAgentLoop } from '@main/agent/runtime/loop/AgentLoop'
import type { ModelStreamExecutor } from '@main/agent/runtime/model/ModelStreamExecutor'
import {
  ChatToolSideEffectSink,
  ChatRenderResponder,
  DefaultMainAgentHostRequestBuilder,
  MainAgentLoopInputBootstrapper
} from '@main/hosts/chat/runtime'
import { toAgentContentParts } from '@main/hosts/chat/runtime/MainAgentHostRequestBuilder'
import { normalizeMediaUrls } from '@main/hosts/chat/persistence/ChatStepStore'
import { ChatLoadedSkillsTranscriptContextProvider } from '@main/hosts/chat/runtime/LoadedSkillsTranscriptContextProvider'
import { VisionObservationService } from '@main/hosts/chat/vision'
import { HostRenderEventForwarder, HostRenderEventMapper } from '@main/hosts/shared/render'
import { normalizePermissionApprovalMode } from '@tools/approval'
import { DefaultAgentRunCompletionAdapter } from './AgentRunCompletionAdapter'
import type {
  MainAgentRuntimeRunner,
  MainAgentRuntimeRunnerInput,
  MainAgentRuntimeRunResult
} from './MainAgentRuntimeRunner'

const DEFAULT_MAIN_AGENT_EXECUTION = {
  maxSteps: 80
} as const

export class DefaultMainAgentRuntimeRunner implements MainAgentRuntimeRunner {
  constructor(
    private readonly hostRequestBuilder = new DefaultMainAgentHostRequestBuilder(),
    private readonly completionAdapter = new DefaultAgentRunCompletionAdapter(),
    private readonly options: {
      hostOutputDispatcher?: HostOutputDispatcher
      modelStreamExecutor?: ModelStreamExecutor
      notificationSinkFactory?: (
        chatTitle: string,
        options: {
          notifyOnFailure: boolean
          occurrenceKey?: string
        }
      ) => AgentEventSink
      visionObservationService?: Pick<VisionObservationService, 'observe'>
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
      input.prepared.chatContext.assistantDraft,
      undefined,
      input.signal,
      {
        chat: input.prepared.chatContext.chat,
        visionObservationService:
          this.options.visionObservationService ?? new VisionObservationService()
      }
    )
    const renderEventMapper = new HostRenderEventMapper()
    chatResponder.connectRenderStateSource(renderEventMapper)
    eventBus.register(
      new HostRenderEventForwarder(
        [
          chatResponder,
          new ChatToolSideEffectSink({
            emitter: input.emitter,
            chatUuid: input.prepared.runSpec.runtimeContext.chatUuid
          }),
          ...(input.hostRenderSinks || [])
        ],
        renderEventMapper,
        this.options.hostOutputDispatcher,
        2
      )
    )

    // Register notification sink last so render pipeline completes even if notifications fail.
    // Desktop interactive and scheduler runs share native terminal notifications.
    const source = input.runInput.input.source
    if ((source === undefined || source === 'schedule') && this.options.notificationSinkFactory) {
      eventBus.register(
        this.options.notificationSinkFactory(input.prepared.chatContext.chat.title, {
          notifyOnFailure: input.runInput.input.nativeNotification?.notifyOnFailure ?? true,
          ...(input.runInput.input.nativeNotification?.occurrenceKey
            ? {
                occurrenceKey: input.runInput.input.nativeNotification.occurrenceKey
              }
            : {})
        })
      )
    }

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
        executeToolCalls: (calls, context) =>
          this.executeToolCalls(calls, input, context.onProgress),
        toolResultWorkspaceRoot:
          input.prepared.runSpec.runtimeContext.workspacePath &&
          isAbsolute(input.prepared.runSpec.runtimeContext.workspacePath)
            ? input.prepared.runSpec.runtimeContext.workspacePath
            : resolveWorkspaceRoot(input.prepared.runSpec.runtimeContext.chatUuid),
        loadedSkillsTranscriptContextProvider: new ChatLoadedSkillsTranscriptContextProvider(
          input.prepared.runSpec.runtimeContext.chatId
        ),
        steeringMessageSource: input.runtimeContext
          ? {
              take: () => {
                const message = input.runtimeContext?.takeSteeringMessage?.()
                if (!message) {
                  return undefined
                }
                const imageUrls = normalizeMediaUrls(message.images)
                return {
                  queueItemId: message.queueItemId,
                  text: message.text,
                  imageUrls,
                  content: toAgentContentParts(
                    input.prepared.runSpec.modelContext.model.type,
                    message.text,
                    imageUrls
                  )
                }
              },
              resolveContext: (message) => chatResponder.takeSteeringContext(message.queueItemId),
              acknowledge: (queueItemId) => {
                input.runtimeContext?.acknowledgeSteeringMessage?.(queueItemId)
              }
            }
          : undefined,
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
      input.runtimeContext?.getPermissionApprovalMode() ??
        input.runInput.input.permissionApprovalMode ??
        input.prepared.chatContext.chat.permissionApprovalMode
    )

    const toolExecutor = new ToolExecutor({
      maxConcurrency: 3,
      signal: input.signal,
      chatUuid: input.prepared.runSpec.runtimeContext.chatUuid,
      workspaceRoot: input.prepared.runSpec.runtimeContext.workspacePath,
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
      requestConfirmation: (request) => input.toolConfirmationRequester.request(request),
      requestUserQuestion: !isInteractiveMessageSource(input.runInput.input.source)
        ? undefined
        : input.toolQuestionRequester
          ? (request) => input.toolQuestionRequester!.request(request)
          : undefined
    })

    return toolExecutor.execute(calls)
  }
}
