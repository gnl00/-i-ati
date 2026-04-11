import { TitleGenerationService, CompressionExecutionService } from '@main/services/chatOperations'
import { PostRunJobService } from '@main/services/chatPostRun'
import { ChatAgentAdapter } from '@main/services/hostAdapters/chat/ChatAgentAdapter'
import { ChatRunEventEmitterFactory, ToolConfirmationManager } from '../infrastructure'
import { RunManager } from './RunManager'
import { DefaultMainAgentNextRuntimeRunner } from './next'

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
    const chatAgentAdapter = new ChatAgentAdapter()
    const postRunJobService = new PostRunJobService(eventEmitterFactory)
    const mainAgentRuntimeRunner = new DefaultMainAgentNextRuntimeRunner()

    const runManager = new RunManager({
      toolConfirmationManager,
      eventEmitterFactory,
      mainAgentRuntimeRunner,
      chatAgentAdapter,
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
