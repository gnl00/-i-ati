import { HostOutputDispatcher } from '@main/hosts/shared/output/HostOutputDispatcher'
import {
  TitleGenerationService,
  CompressionExecutionService
} from '@main/orchestration/chat/maintenance'
import { PostRunJobService } from '@main/orchestration/chat/postRun'
import { ChatAgentAdapter } from '@main/hosts/chat/ChatAgentAdapter'
import {
  RunEventEmitterFactory,
  ToolConfirmationManager,
  ToolQuestionManager
} from '../infrastructure'
import { RunManager } from './RunManager'
import { DefaultMainAgentRuntimeRunner } from './DefaultMainAgentRuntimeRunner'
import { AgentNotificationSink } from '@main/notifications/AgentNotificationSink'

export type RunRuntimeDeps = {
  postRunJobService: PostRunJobService
  toolConfirmationManager: ToolConfirmationManager
  toolQuestionManager: ToolQuestionManager
  eventEmitterFactory: RunEventEmitterFactory
  runManager: RunManager
  compressionExecutionService: CompressionExecutionService
  titleGenerationService: TitleGenerationService
}

export class RunRuntimeFactory {
  create(): RunRuntimeDeps {
    const hostOutputDispatcher = new HostOutputDispatcher()
    const toolConfirmationManager = new ToolConfirmationManager(hostOutputDispatcher)
    const toolQuestionManager = new ToolQuestionManager()
    const eventEmitterFactory = new RunEventEmitterFactory(hostOutputDispatcher)
    const chatAgentAdapter = new ChatAgentAdapter()
    const postRunJobService = new PostRunJobService(eventEmitterFactory)
    const mainAgentRuntimeRunner = new DefaultMainAgentRuntimeRunner(undefined, undefined, {
      hostOutputDispatcher,
      notificationSinkFactory: (chatTitle, options): AgentNotificationSink =>
        new AgentNotificationSink(chatTitle, options)
    })

    const runManager = new RunManager({
      toolConfirmationManager,
      toolQuestionManager,
      eventEmitterFactory,
      mainAgentRuntimeRunner,
      chatAgentAdapter,
      postRunJobService
    })

    return {
      postRunJobService,
      toolConfirmationManager,
      toolQuestionManager,
      eventEmitterFactory,
      runManager,
      compressionExecutionService: new CompressionExecutionService(eventEmitterFactory),
      titleGenerationService: new TitleGenerationService(eventEmitterFactory)
    }
  }
}
