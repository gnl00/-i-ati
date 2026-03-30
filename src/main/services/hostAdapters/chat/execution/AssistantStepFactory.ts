import type {
  AgentMessageEventSink,
  AgentStepEventListener,
  ToolConfirmationRequester
} from '@main/services/agentCore/ports'
import type { RunSpec } from '@main/services/agentCore/types'
import { ToolExecutor } from '@main/services/agentCore/tools'
import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'
import { ChunkParser, AgentStepLoop, AgentStepRuntimeFactory } from '@main/services/agentCore/execution'
import { subagentRuntimeBridge } from '@main/services/subagent/subagent-runtime-bridge'
import {
  ChatEventMapper,
  type ChatStepRuntimeContext
} from '../mapping'
import { ChatStepStore } from '../persistence'
import { ChatRequestHistory } from './ChatRequestHistory'
import { ChatStepCommitter } from './ChatStepCommitter'
import { AssistantStepEventMapper } from './AssistantStepEventMapper'

export type AssistantStepHandle = {
  loop: AgentStepLoop
  stepCommitter: Pick<ChatStepCommitter, 'getFinalAssistantMessage' | 'getLastUsage'>
}

export type AssistantStepFactoryInput = {
  runSpec: RunSpec
  stepContext: ChatStepRuntimeContext
  signal: AbortSignal
  emitter: ChatRunEventEmitter
  toolConfirmationRequester: ToolConfirmationRequester
}

export class AssistantStepFactory {
  constructor(
    private readonly runtimeFactory = new AgentStepRuntimeFactory()
  ) {}

  create(input: AssistantStepFactoryInput): AssistantStepHandle {
    const { runSpec, stepContext, signal, emitter, toolConfirmationRequester } = input
    subagentRuntimeBridge.register(runSpec.submissionId, {
      requester: toolConfirmationRequester,
      emitter
    })
    const eventListener: AgentStepEventListener = new AssistantStepEventMapper(emitter)
    const messageEvents: AgentMessageEventSink = new ChatEventMapper(emitter)
    const parser = new ChunkParser()
    const requestHistory = new ChatRequestHistory(runSpec.request.messages)
    const stepCommitter = new ChatStepCommitter(
      stepContext.messageEntities,
      messageEvents,
      new ChatStepStore(),
      stepContext.chatId,
      stepContext.chatUuid
    )

    const toolExecutor = new ToolExecutor({
      maxConcurrency: 3,
      signal,
      chatUuid: stepContext.chatUuid,
      submissionId: runSpec.submissionId,
      modelRef: {
        accountId: runSpec.modelContext.account.id,
        modelId: runSpec.modelContext.model.id
      },
      requestConfirmation: (requestConfirmation) =>
        toolConfirmationRequester.request(requestConfirmation),
      onProgress: (progress) => {
        eventListener.handleToolExecutionProgress(progress)
      }
    })

    const loop = this.runtimeFactory.create({
      runSpec,
      signal,
      parser,
      requestHistory,
      stepCommitter,
      eventListener,
      toolExecutor,
      toolConfirmationRequester
    })

    return {
      loop,
      stepCommitter
    }
  }
}
