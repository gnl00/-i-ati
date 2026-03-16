import type {
  AgentEventMapper,
  ToolConfirmationRequester
} from '@main/services/agentCore/contracts'
import type { RunSpec } from '@main/services/agentCore/types'
import { ToolExecutor } from '@main/services/agentCore/tools'
import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'
import { ChunkParser, AgentStepLoop, AgentStepRuntimeFactory } from '@main/services/agentCore/execution'
import type { ChatStepRuntimeContext } from '../mapping'
import {
  AssistantStepMessageManagerImpl,
  type AssistantStepMessageManagerImplLike
} from './AssistantStepMessageManager'
import { AssistantStepEventMapper } from './AssistantStepEventMapper'

export type AssistantStepHandle = {
  loop: AgentStepLoop
  messageManager: AssistantStepMessageManagerImplLike
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
    const eventMapper: AgentEventMapper = new AssistantStepEventMapper(emitter)
    const parser = new ChunkParser()
    const messageManager = new AssistantStepMessageManagerImpl(
      stepContext.messageEntities,
      runSpec.request,
      eventMapper,
      stepContext.chatId,
      stepContext.chatUuid
    )

    const toolExecutor = new ToolExecutor({
      maxConcurrency: 3,
      signal,
      chatUuid: stepContext.chatUuid,
      requestConfirmation: (requestConfirmation) =>
        toolConfirmationRequester.request(requestConfirmation),
      onProgress: (progress) => {
        eventMapper.handleToolExecutionProgress(progress)
      }
    })

    const loop = this.runtimeFactory.create({
      runSpec,
      signal,
      parser,
      messageManager,
      eventMapper,
      toolExecutor,
      toolConfirmationRequester
    })

    return {
      loop,
      messageManager
    }
  }
}
