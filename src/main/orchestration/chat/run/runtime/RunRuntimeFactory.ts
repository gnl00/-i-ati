import { TitleGenerationService, CompressionExecutionService } from '@main/orchestration/chat/maintenance'
import { PostRunJobService } from '@main/orchestration/chat/postRun'
import { ChatAgentAdapter } from '@main/hosts/chat/ChatAgentAdapter'
import { RunEventEmitterFactory, ToolConfirmationManager } from '../infrastructure'
import { RunManager } from './RunManager'
import { DefaultMainAgentRuntimeRunner } from './DefaultMainAgentRuntimeRunner'
import { toolResultCompactionScheduler } from '@main/orchestration/chat/toolResultCompaction/ToolResultCompactionScheduler'
import { AgentNotificationSink } from '@main/notifications/AgentNotificationSink'

export type RunRuntimeDeps = {
  toolConfirmationManager: ToolConfirmationManager
  eventEmitterFactory: RunEventEmitterFactory
  runManager: RunManager
  compressionExecutionService: CompressionExecutionService
  titleGenerationService: TitleGenerationService
}

export class RunRuntimeFactory {
  create(): RunRuntimeDeps {
    const toolConfirmationManager = new ToolConfirmationManager()
    const eventEmitterFactory = new RunEventEmitterFactory()
    const chatAgentAdapter = new ChatAgentAdapter()
    const postRunJobService = new PostRunJobService(eventEmitterFactory)
    const mainAgentRuntimeRunner = new DefaultMainAgentRuntimeRunner(undefined, undefined, {
      toolResultCompactionTrigger: toolResultCompactionScheduler,
      notificationSinkFactory: chatTitle => new AgentNotificationSink(chatTitle)
    })

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
