import { AgentRunKernel } from '@main/services/agentCore/run-kernel'
import { TitleGenerationService, CompressionExecutionService } from '@main/services/chatOperations'
import { PostRunJobService } from '@main/services/chatPostRun'
import { ChatAgentAdapter, AssistantStepFactory } from '@main/services/hostAdapters/chat'
import { ChatRunEventEmitterFactory, ToolConfirmationManager } from '../infrastructure'
import { RunManager } from './RunManager'

export type ChatRunRuntime = {
  toolConfirmationManager: ToolConfirmationManager
  eventEmitterFactory: ChatRunEventEmitterFactory
  runManager: RunManager
  compressionExecutionService: CompressionExecutionService
  titleGenerationService: TitleGenerationService
}

export class ChatRunRuntimeFactory {
  create(): ChatRunRuntime {
    const toolConfirmationManager = new ToolConfirmationManager()
    const eventEmitterFactory = new ChatRunEventEmitterFactory()
    const agentRunKernel = new AgentRunKernel()
    const chatAgentAdapter = new ChatAgentAdapter()
    const assistantStepFactory = new AssistantStepFactory()
    const postRunJobService = new PostRunJobService(eventEmitterFactory)

    const runManager = new RunManager({
      toolConfirmationManager,
      eventEmitterFactory,
      agentRunKernel,
      chatAgentAdapter,
      assistantStepFactory,
      postRunJobService
    })

    return {
      toolConfirmationManager,
      eventEmitterFactory,
      runManager,
      compressionExecutionService: new CompressionExecutionService(eventEmitterFactory),
      titleGenerationService: new TitleGenerationService(eventEmitterFactory)
    }
  }
}
