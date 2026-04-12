import type { DbRuntime } from '../core/DbRuntime'
import { PluginRuntimeService } from '@main/services/plugins'
import { AssistantService } from './AssistantService'
import { ChatService } from './ChatService'
import { CompressedSummaryService } from './CompressedSummaryService'
import { ConfigService } from './ConfigService'
import { PlanningService } from './PlanningService'
import { PluginService } from './PluginService'
import { RunEventService } from './RunEventService'

export class DbAppServices {
  public readonly pluginRuntimeService: PluginRuntimeService
  public readonly chatService: ChatService
  public readonly configService: ConfigService
  public readonly planningService: PlanningService
  public readonly pluginService: PluginService
  public readonly runEventService: RunEventService
  public readonly compressedSummaryService: CompressedSummaryService
  public readonly assistantService: AssistantService

  constructor(runtime: DbRuntime) {
    this.pluginRuntimeService = new PluginRuntimeService({
      pluginStore: runtime.pluginRepository,
      pluginManifestSyncService: runtime.pluginManifestSyncService
    })
    this.chatService = new ChatService({
      chatRepository: () => runtime.chatRepository,
      chatHostBindingRepository: () => runtime.chatHostBindingRepository,
      messageRepository: () => runtime.messageRepository,
      emotionStateRepository: () => runtime.emotionStateRepository,
      workContextRepository: () => runtime.workContextRepository
    })
    this.configService = new ConfigService({
      configRepository: () => runtime.configRepository,
      mcpServerRepository: () => runtime.mcpServerRepository,
      providerRepository: () => runtime.providerRepository
    })
    this.planningService = new PlanningService({
      taskPlanRepository: () => runtime.taskPlanRepository,
      scheduledTaskRepository: () => runtime.scheduledTaskRepository
    })
    this.pluginService = new PluginService({
      pluginRuntimeService: () => this.pluginRuntimeService
    })
    this.runEventService = new RunEventService({
      runEventRepository: () => runtime.runEventRepository
    })
    this.compressedSummaryService = new CompressedSummaryService({
      compressedSummaryRepository: () => runtime.compressedSummaryRepository
    })
    this.assistantService = new AssistantService({
      assistantRepository: () => runtime.assistantRepository
    })
  }
}
