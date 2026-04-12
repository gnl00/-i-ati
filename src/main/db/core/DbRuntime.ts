import { AppDatabase } from './Database'
import { ConfigDao } from '../dao/ConfigDao'
import { McpServerDao } from '../dao/McpServerDao'
import { PluginDao } from '../dao/PluginDao'
import { PluginCapabilityDao } from '../dao/PluginCapabilityDao'
import { PluginSettingDao } from '../dao/PluginSettingDao'
import { ProviderDao } from '../dao/ProviderDao'
import { ChatDao } from '../dao/ChatDao'
import { ChatHostBindingDao } from '../dao/ChatHostBindingDao'
import { SkillDao } from '../dao/SkillDao'
import { MessageDao } from '../dao/MessageDao'
import { EmotionStateDao } from '../dao/EmotionStateDao'
import { WorkContextDao } from '../dao/WorkContextDao'
import { CompressedSummaryDao } from '../dao/CompressedSummaryDao'
import { RunEventDao } from '../dao/RunEventDao'
import { AssistantDao } from '../dao/AssistantDao'
import { TaskPlanDao } from '../dao/TaskPlanDao'
import { ScheduledTaskDao } from '../dao/ScheduledTaskDao'
import { TaskPlanRepository } from '../repositories/TaskPlanRepository'
import { ScheduledTaskRepository } from '../repositories/ScheduledTaskRepository'
import { ChatRepository } from '../repositories/ChatRepository'
import { ChatHostBindingRepository } from '../repositories/ChatHostBindingRepository'
import { MessageRepository } from '../repositories/MessageRepository'
import { EmotionStateRepository } from '../repositories/EmotionStateRepository'
import { WorkContextRepository } from '../repositories/WorkContextRepository'
import { ConfigRepository } from '../repositories/ConfigRepository'
import { McpServerRepository } from '../repositories/McpServerRepository'
import { PluginRepository } from '../repositories/PluginRepository'
import { ProviderRepository } from '../repositories/ProviderRepository'
import { CompressedSummaryRepository } from '../repositories/CompressedSummaryRepository'
import { RunEventRepository } from '../repositories/RunEventRepository'
import { AssistantRepository } from '../repositories/AssistantRepository'
import { PluginBootstrapService } from '../services/PluginBootstrapService'
import { McpServerMigrationService } from '../services/McpServerMigrationService'
import { PluginManifestSyncService } from '../services/PluginManifestSyncService'

export type DbRuntimeInitializationStats = {
  chats: number
  messages: number
}

export class DbRuntime {
  private readonly dbCore = AppDatabase.getInstance()
  private db: ReturnType<AppDatabase['getDb']> | null = null
  private initialized = false

  private configRepo?: ConfigDao
  private mcpServerRepo?: McpServerDao
  private pluginRepo?: PluginDao
  private pluginCapabilityRepo?: PluginCapabilityDao
  private pluginSettingRepo?: PluginSettingDao
  private providerRepo?: ProviderDao
  private chatRepo?: ChatDao
  private chatHostBindingRepo?: ChatHostBindingDao
  private skillRepo?: SkillDao
  private messageRepo?: MessageDao
  private emotionStateRepo?: EmotionStateDao
  private workContextRepo?: WorkContextDao
  private summaryRepo?: CompressedSummaryDao
  private runEventRepo?: RunEventDao
  private assistantRepo?: AssistantDao
  private taskPlanRepo?: TaskPlanDao
  private scheduledTaskRepo?: ScheduledTaskDao

  private _chatRepository?: ChatRepository
  private _chatHostBindingRepository?: ChatHostBindingRepository
  private _messageRepository?: MessageRepository
  private _emotionStateRepository?: EmotionStateRepository
  private _workContextRepository?: WorkContextRepository
  private _taskPlanRepository?: TaskPlanRepository
  private _scheduledTaskRepository?: ScheduledTaskRepository
  private _configRepository?: ConfigRepository
  private _mcpServerRepository?: McpServerRepository
  private _pluginRepository?: PluginRepository
  private _providerRepository?: ProviderRepository
  private _compressedSummaryRepository?: CompressedSummaryRepository
  private _runEventRepository?: RunEventRepository
  private _assistantRepository?: AssistantRepository
  private _pluginManifestSyncService?: PluginManifestSyncService

  initialize(): DbRuntimeInitializationStats {
    if (this.initialized && this.db) {
      return this.collectStats()
    }

    this.db = this.dbCore.initialize()

    this.configRepo = new ConfigDao(this.db)
    this.mcpServerRepo = new McpServerDao(this.db)
    this.pluginRepo = new PluginDao(this.db)
    this.pluginCapabilityRepo = new PluginCapabilityDao(this.db)
    this.pluginSettingRepo = new PluginSettingDao(this.db)
    this.providerRepo = new ProviderDao(this.db)
    this.chatRepo = new ChatDao(this.db)
    this.chatHostBindingRepo = new ChatHostBindingDao(this.db)
    this.skillRepo = new SkillDao(this.db)
    this.messageRepo = new MessageDao(this.db)
    this.emotionStateRepo = new EmotionStateDao(this.db)
    this.workContextRepo = new WorkContextDao(this.db)
    this.summaryRepo = new CompressedSummaryDao(this.db)
    this.runEventRepo = new RunEventDao(this.db)
    this.assistantRepo = new AssistantDao(this.db)
    this.taskPlanRepo = new TaskPlanDao(this.db)
    this.scheduledTaskRepo = new ScheduledTaskDao(this.db)

    this._chatRepository = new ChatRepository({
      hasDb: () => Boolean(this.db),
      getChatRepo: () => this.chatRepo,
      getSkillRepo: () => this.skillRepo
    })
    this._chatHostBindingRepository = new ChatHostBindingRepository({
      hasDb: () => Boolean(this.db),
      getChatHostBindingRepo: () => this.chatHostBindingRepo
    })
    this._messageRepository = new MessageRepository({
      hasDb: () => Boolean(this.db),
      getChatRepo: () => this.chatRepo,
      getMessageRepo: () => this.messageRepo
    })
    this._emotionStateRepository = new EmotionStateRepository({
      hasDb: () => Boolean(this.db),
      getEmotionStateRepo: () => this.emotionStateRepo
    })
    this._workContextRepository = new WorkContextRepository({
      hasDb: () => Boolean(this.db),
      getWorkContextRepo: () => this.workContextRepo
    })
    this._taskPlanRepository = new TaskPlanRepository({
      hasDb: () => Boolean(this.db),
      getTaskPlanRepo: () => this.taskPlanRepo
    })
    this._scheduledTaskRepository = new ScheduledTaskRepository({
      hasDb: () => Boolean(this.db),
      getScheduledTaskRepo: () => this.scheduledTaskRepo
    })
    this._providerRepository = new ProviderRepository({
      hasDb: () => Boolean(this.db),
      getDb: () => this.db,
      getProviderRepo: () => this.providerRepo
    })
    this._configRepository = new ConfigRepository({
      hasDb: () => Boolean(this.db),
      getConfigRepo: () => this.configRepo,
      providerRepository: () => this._providerRepository
    })
    this._mcpServerRepository = new McpServerRepository({
      hasDb: () => Boolean(this.db),
      getDb: () => this.db,
      getMcpServerRepo: () => this.mcpServerRepo
    })
    this._pluginRepository = new PluginRepository({
      hasDb: () => Boolean(this.db),
      getDb: () => this.db,
      getPluginRepo: () => this.pluginRepo,
      getPluginCapabilityRepo: () => this.pluginCapabilityRepo,
      getPluginSettingRepo: () => this.pluginSettingRepo
    })
    this._pluginManifestSyncService = new PluginManifestSyncService({
      hasDb: () => Boolean(this.db),
      getDb: () => this.db,
      getPluginRepo: () => this.pluginRepo,
      getPluginCapabilityRepo: () => this.pluginCapabilityRepo,
      getPluginSettingRepo: () => this.pluginSettingRepo,
      pluginRepository: () => this._pluginRepository
    })
    this._compressedSummaryRepository = new CompressedSummaryRepository({
      hasDb: () => Boolean(this.db),
      getSummaryRepo: () => this.summaryRepo
    })
    this._runEventRepository = new RunEventRepository({
      hasDb: () => Boolean(this.db),
      getRunEventRepo: () => this.runEventRepo
    })
    this._assistantRepository = new AssistantRepository({
      hasDb: () => Boolean(this.db),
      getAssistantRepo: () => this.assistantRepo
    })

    new McpServerMigrationService({
      configDao: () => this.configRepo,
      mcpServerDao: () => this.mcpServerRepo,
      mcpServerRepository: () => this._mcpServerRepository
    }).migrateLegacyConfigIfNeeded()

    new PluginBootstrapService({
      getDb: () => this.db,
      pluginRepository: () => this._pluginRepository,
      pluginDao: () => this.pluginRepo,
      pluginCapabilityDao: () => this.pluginCapabilityRepo,
      configDao: () => this.configRepo
    }).initialize()

    this.initialized = true
    return this.collectStats()
  }

  isReady(): boolean {
    return this.initialized
  }

  close(): void {
    if (!this.db) {
      return
    }

    this.dbCore.close()
    this.db = null
    this.configRepo = undefined
    this.mcpServerRepo = undefined
    this.pluginRepo = undefined
    this.pluginCapabilityRepo = undefined
    this.pluginSettingRepo = undefined
    this.providerRepo = undefined
    this.chatRepo = undefined
    this.chatHostBindingRepo = undefined
    this.skillRepo = undefined
    this.messageRepo = undefined
    this.emotionStateRepo = undefined
    this.workContextRepo = undefined
    this.summaryRepo = undefined
    this.runEventRepo = undefined
    this.assistantRepo = undefined
    this.taskPlanRepo = undefined
    this.scheduledTaskRepo = undefined
    this._chatRepository = undefined
    this._chatHostBindingRepository = undefined
    this._messageRepository = undefined
    this._emotionStateRepository = undefined
    this._workContextRepository = undefined
    this._taskPlanRepository = undefined
    this._scheduledTaskRepository = undefined
    this._configRepository = undefined
    this._mcpServerRepository = undefined
    this._pluginRepository = undefined
    this._pluginManifestSyncService = undefined
    this._providerRepository = undefined
    this._compressedSummaryRepository = undefined
    this._runEventRepository = undefined
    this._assistantRepository = undefined
    this.initialized = false
  }

  get chatRepository(): ChatRepository {
    return this.requireService(this._chatRepository, 'Chat repository')
  }

  get chatHostBindingRepository(): ChatHostBindingRepository {
    return this.requireService(this._chatHostBindingRepository, 'Chat host binding repository')
  }

  get messageRepository(): MessageRepository {
    return this.requireService(this._messageRepository, 'Message repository')
  }

  get emotionStateRepository(): EmotionStateRepository {
    return this.requireService(this._emotionStateRepository, 'Emotion state repository')
  }

  get workContextRepository(): WorkContextRepository {
    return this.requireService(this._workContextRepository, 'Work context repository')
  }

  get taskPlanRepository(): TaskPlanRepository {
    return this.requireService(this._taskPlanRepository, 'Task plan repository')
  }

  get scheduledTaskRepository(): ScheduledTaskRepository {
    return this.requireService(this._scheduledTaskRepository, 'Scheduled task repository')
  }

  get configRepository(): ConfigRepository {
    return this.requireService(this._configRepository, 'Config repository')
  }

  get mcpServerRepository(): McpServerRepository {
    return this.requireService(this._mcpServerRepository, 'MCP server repository')
  }

  get pluginRepository(): PluginRepository {
    return this.requireService(this._pluginRepository, 'Plugin repository')
  }

  get pluginManifestSyncService(): PluginManifestSyncService {
    return this.requireService(this._pluginManifestSyncService, 'Plugin manifest sync service')
  }

  get providerRepository(): ProviderRepository {
    return this.requireService(this._providerRepository, 'Provider repository')
  }

  get compressedSummaryRepository(): CompressedSummaryRepository {
    return this.requireService(this._compressedSummaryRepository, 'Compressed summary repository')
  }

  get runEventRepository(): RunEventRepository {
    return this.requireService(this._runEventRepository, 'Run event repository')
  }

  get assistantRepository(): AssistantRepository {
    return this.requireService(this._assistantRepository, 'Assistant repository')
  }

  private collectStats(): DbRuntimeInitializationStats {
    const db = this.requireDb()
    const chatCount = db.prepare('SELECT COUNT(*) as count FROM chats').get() as { count: number }
    const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }

    return {
      chats: chatCount.count,
      messages: messageCount.count
    }
  }

  private requireDb(): ReturnType<AppDatabase['getDb']> {
    if (!this.db) {
      throw new Error('Database runtime not initialized')
    }
    return this.db
  }

  private requireService<T>(value: T | undefined, name: string): T {
    if (!this.initialized || !value) {
      throw new Error(`${name} not initialized`)
    }
    return value
  }
}
