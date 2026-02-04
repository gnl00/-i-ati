/**
 * DatabaseService - main-process database facade.
 * Orchestrates SQLite repositories and delegates domain logic to specialized data services
 * (chat/message/config/provider/assistant/plan/schedule/compressed-summary/submit-event).
 */

import { AppDatabase } from '../db/Database'
import { ConfigRepository } from '../db/repositories/ConfigRepository'
import { ProviderRepository } from '../db/repositories/ProviderRepository'
import { ChatRepository } from '../db/repositories/ChatRepository'
import { ChatSkillRepository } from '../db/repositories/ChatSkillRepository'
import { MessageRepository } from '../db/repositories/MessageRepository'
import { CompressedSummaryRepository } from '../db/repositories/CompressedSummaryRepository'
import { ChatSubmitEventRepository } from '../db/repositories/ChatSubmitEventRepository'
import { AssistantRepository } from '../db/repositories/AssistantRepository'
import { TaskPlanRepository } from '../db/repositories/TaskPlanRepository'
import { ScheduledTaskRepository, ScheduledTaskRow } from '../db/repositories/ScheduledTaskRepository'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'
import { TaskPlanDataService } from './database/TaskPlanDataService'
import { ScheduledTaskDataService } from './database/ScheduledTaskDataService'
import { ChatDataService } from './database/ChatDataService'
import { MessageDataService } from './database/MessageDataService'
import { ConfigDataService } from './database/ConfigDataService'
import { CompressedSummaryDataService } from './database/CompressedSummaryDataService'
import { ChatSubmitEventDataService } from './database/ChatSubmitEventDataService'
import { AssistantDataService } from './database/AssistantDataService'


/**
 * SQLite 数据库服务
 */
class DatabaseService {
  private static instance: DatabaseService
  private dbCore: AppDatabase
  private db: ReturnType<AppDatabase['getDb']> | null = null
  private isInitialized: boolean = false

  private configRepo?: ConfigRepository
  private providerRepo?: ProviderRepository
  private chatRepo?: ChatRepository
  private chatSkillRepo?: ChatSkillRepository
  private messageRepo?: MessageRepository
  private summaryRepo?: CompressedSummaryRepository
  private submitEventRepo?: ChatSubmitEventRepository
  private assistantRepo?: AssistantRepository
  private taskPlanRepo?: TaskPlanRepository
  private scheduledTaskRepo?: ScheduledTaskRepository
  private chatDataService?: ChatDataService
  private messageDataService?: MessageDataService
  private planDataService?: TaskPlanDataService
  private scheduledTaskDataService?: ScheduledTaskDataService
  private configDataService?: ConfigDataService
  private compressedSummaryDataService?: CompressedSummaryDataService
  private chatSubmitEventDataService?: ChatSubmitEventDataService
  private assistantDataService?: AssistantDataService

  private constructor() {
    this.dbCore = AppDatabase.getInstance()
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  /**
   * 初始化服务和数据库
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      console.log('[DatabaseService] Initializing database service...')

      this.db = this.dbCore.initialize()
      this.configRepo = new ConfigRepository(this.db)
      this.providerRepo = new ProviderRepository(this.db)
      this.chatRepo = new ChatRepository(this.db)
      this.chatSkillRepo = new ChatSkillRepository(this.db)
      this.messageRepo = new MessageRepository(this.db)
      this.summaryRepo = new CompressedSummaryRepository(this.db)
      this.submitEventRepo = new ChatSubmitEventRepository(this.db)
      this.assistantRepo = new AssistantRepository(this.db)
      this.taskPlanRepo = new TaskPlanRepository(this.db)
      this.scheduledTaskRepo = new ScheduledTaskRepository(this.db)
      this.chatDataService = new ChatDataService({
        hasDb: () => Boolean(this.db),
        getChatRepo: () => this.chatRepo,
        getChatSkillRepo: () => this.chatSkillRepo
      })
      this.messageDataService = new MessageDataService({
        hasDb: () => Boolean(this.db),
        getMessageRepo: () => this.messageRepo
      })
      this.planDataService = new TaskPlanDataService({
        hasDb: () => Boolean(this.db),
        getTaskPlanRepo: () => this.taskPlanRepo
      })
      this.scheduledTaskDataService = new ScheduledTaskDataService({
        hasDb: () => Boolean(this.db),
        getScheduledTaskRepo: () => this.scheduledTaskRepo
      })
      this.configDataService = new ConfigDataService({
        hasDb: () => Boolean(this.db),
        getDb: () => this.db,
        getConfigRepo: () => this.configRepo,
        getProviderRepo: () => this.providerRepo
      })
      this.compressedSummaryDataService = new CompressedSummaryDataService({
        hasDb: () => Boolean(this.db),
        getSummaryRepo: () => this.summaryRepo
      })
      this.chatSubmitEventDataService = new ChatSubmitEventDataService({
        hasDb: () => Boolean(this.db),
        getSubmitEventRepo: () => this.submitEventRepo
      })
      this.assistantDataService = new AssistantDataService({
        hasDb: () => Boolean(this.db),
        getAssistantRepo: () => this.assistantRepo
      })

      this.isInitialized = true

      const chatCount = this.db.prepare('SELECT COUNT(*) as count FROM chats').get() as { count: number }
      const messageCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }
      console.log(`[DatabaseService] Initialized with ${chatCount.count} chats and ${messageCount.count} messages`)

      // 初始化内置 Assistants
      const { initializeBuiltInAssistants } = await import('./AssistantInitializer')
      await initializeBuiltInAssistants()
    } catch (error) {
      console.error('[DatabaseService] Failed to initialize:', error)
      throw error
    }
  }

  // ==================== Chat / Message Methods ====================

  public saveChat(data: ChatEntity): number {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    return this.chatDataService.saveChat(data)
  }

  public getAllChats(): ChatEntity[] {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    return this.chatDataService.getAllChats()
  }

  public getChatById(id: number): ChatEntity | undefined {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    return this.chatDataService.getChatById(id)
  }

  public getChatByUuid(uuid: string): ChatEntity | undefined {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    return this.chatDataService.getChatByUuid(uuid)
  }

  public getWorkspacePathByUuid(uuid: string): string | undefined {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    return this.chatDataService.getWorkspacePathByUuid(uuid)
  }

  public updateChat(data: ChatEntity): void {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    this.chatDataService.updateChat(data)
  }

  public deleteChat(id: number): void {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    this.chatDataService.deleteChat(id)
  }

  public getChatSkills(chatId: number): string[] {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    return this.chatDataService.getChatSkills(chatId)
  }

  public addChatSkill(chatId: number, skillName: string): void {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    this.chatDataService.addChatSkill(chatId, skillName)
  }

  public removeChatSkill(chatId: number, skillName: string): void {
    if (!this.chatDataService) throw new Error('Chat data service not initialized')
    this.chatDataService.removeChatSkill(chatId, skillName)
  }

  public saveMessage(data: MessageEntity): number {
    if (!this.messageDataService) throw new Error('Message data service not initialized')
    return this.messageDataService.saveMessage(data)
  }

  public getAllMessages(): MessageEntity[] {
    if (!this.messageDataService) throw new Error('Message data service not initialized')
    return this.messageDataService.getAllMessages()
  }

  public getMessageById(id: number): MessageEntity | undefined {
    if (!this.messageDataService) throw new Error('Message data service not initialized')
    return this.messageDataService.getMessageById(id)
  }

  public getMessagesByChatId(chatId: number): MessageEntity[] {
    if (!this.messageDataService) throw new Error('Message data service not initialized')
    return this.messageDataService.getMessagesByChatId(chatId)
  }

  public getMessagesByChatUuid(chatUuid: string): MessageEntity[] {
    if (!this.messageDataService) throw new Error('Message data service not initialized')
    return this.messageDataService.getMessagesByChatUuid(chatUuid)
  }

  public getMessageByIds(ids: number[]): MessageEntity[] {
    if (!this.messageDataService) throw new Error('Message data service not initialized')
    return this.messageDataService.getMessageByIds(ids)
  }

  public updateMessage(data: MessageEntity): void {
    if (!this.messageDataService) throw new Error('Message data service not initialized')
    this.messageDataService.updateMessage(data)
  }

  public deleteMessage(id: number): void {
    if (!this.messageDataService) throw new Error('Message data service not initialized')
    this.messageDataService.deleteMessage(id)
  }

  // ==================== Task Planner Methods ====================

  public saveTaskPlan(plan: Plan): void {
    if (!this.planDataService) throw new Error('Plan data service not initialized')
    this.planDataService.saveTaskPlan(plan)
  }

  public updateTaskPlan(plan: Plan): void {
    if (!this.planDataService) throw new Error('Plan data service not initialized')
    this.planDataService.updateTaskPlan(plan)
  }

  public updateTaskPlanStatus(id: string, status: PlanStatus, currentStepId?: string, failureReason?: string): void {
    if (!this.planDataService) throw new Error('Plan data service not initialized')
    this.planDataService.updateTaskPlanStatus(id, status, currentStepId, failureReason)
  }

  public getTaskPlanById(id: string): Plan | undefined {
    if (!this.planDataService) throw new Error('Plan data service not initialized')
    return this.planDataService.getTaskPlanById(id)
  }

  public getTaskPlansByChatUuid(chatUuid: string): Plan[] {
    if (!this.planDataService) throw new Error('Plan data service not initialized')
    return this.planDataService.getTaskPlansByChatUuid(chatUuid)
  }

  public deleteTaskPlan(id: string): void {
    if (!this.planDataService) throw new Error('Plan data service not initialized')
    this.planDataService.deleteTaskPlan(id)
  }

  public saveTaskPlanSteps(planId: string, steps: PlanStep[], createdAt?: number, updatedAt?: number): void {
    if (!this.planDataService) throw new Error('Plan data service not initialized')
    this.planDataService.saveTaskPlanSteps(planId, steps, createdAt, updatedAt)
  }

  public upsertTaskPlanStep(planId: string, step: PlanStep): void {
    if (!this.planDataService) throw new Error('Plan data service not initialized')
    this.planDataService.upsertTaskPlanStep(planId, step)
  }

  public updateTaskPlanStepStatus(
    planId: string,
    stepId: string,
    status: PlanStep['status'],
    output?: unknown,
    error?: string,
    notes?: string
  ): void {
    if (!this.planDataService) throw new Error('Plan data service not initialized')
    this.planDataService.updateTaskPlanStepStatus(planId, stepId, status, output, error, notes)
  }

  // ==================== Scheduled Task Methods ====================

  public saveScheduledTask(task: ScheduledTaskRow): void {
    if (!this.scheduledTaskDataService) throw new Error('Scheduled task data service not initialized')
    this.scheduledTaskDataService.saveScheduledTask(task)
  }

  public updateScheduledTask(task: ScheduledTaskRow): void {
    if (!this.scheduledTaskDataService) throw new Error('Scheduled task data service not initialized')
    this.scheduledTaskDataService.updateScheduledTask(task)
  }

  public updateScheduledTaskStatus(
    id: string,
    status: string,
    attemptCount: number,
    lastError?: string,
    resultMessageId?: number
  ): void {
    if (!this.scheduledTaskDataService) throw new Error('Scheduled task data service not initialized')
    this.scheduledTaskDataService.updateScheduledTaskStatus(id, status, attemptCount, lastError, resultMessageId)
  }

  public getScheduledTaskById(id: string): ScheduledTaskRow | undefined {
    if (!this.scheduledTaskDataService) throw new Error('Scheduled task data service not initialized')
    return this.scheduledTaskDataService.getScheduledTaskById(id)
  }

  public getScheduledTasksByChatUuid(chatUuid: string): ScheduledTaskRow[] {
    if (!this.scheduledTaskDataService) throw new Error('Scheduled task data service not initialized')
    return this.scheduledTaskDataService.getScheduledTasksByChatUuid(chatUuid)
  }

  public getScheduledTasksByStatus(status: string, limit: number): ScheduledTaskRow[] {
    if (!this.scheduledTaskDataService) throw new Error('Scheduled task data service not initialized')
    return this.scheduledTaskDataService.getScheduledTasksByStatus(status, limit)
  }

  public claimDueScheduledTasks(now: number, limit: number): ScheduledTaskRow[] {
    if (!this.scheduledTaskDataService) throw new Error('Scheduled task data service not initialized')
    return this.scheduledTaskDataService.claimDueScheduledTasks(now, limit)
  }

  public deleteScheduledTask(id: string): void {
    if (!this.scheduledTaskDataService) throw new Error('Scheduled task data service not initialized')
    this.scheduledTaskDataService.deleteScheduledTask(id)
  }

  // ==================== Config 操作 ====================

  public getConfig(): IAppConfig | undefined {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    return this.configDataService.getConfig()
  }

  public saveConfig(config: IAppConfig): void {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    this.configDataService.saveConfig(config)
  }

  public getConfigValue(key: string): string | undefined {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    return this.configDataService.getConfigValue(key)
  }

  public saveConfigValue(key: string, value: string, version?: number | null): void {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    this.configDataService.saveConfigValue(key, value, version)
  }

  public initConfig(): IAppConfig {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    return this.configDataService.initConfig()
  }

  public getProviderDefinitions(): ProviderDefinition[] {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    return this.configDataService.getProviderDefinitions()
  }

  public saveProviderDefinition(definition: ProviderDefinition): void {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    this.configDataService.saveProviderDefinition(definition)
  }

  public deleteProviderDefinition(providerId: string): void {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    this.configDataService.deleteProviderDefinition(providerId)
  }

  public getProviderAccounts(): ProviderAccount[] {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    return this.configDataService.getProviderAccounts()
  }

  public saveProviderAccount(account: ProviderAccount): void {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    this.configDataService.saveProviderAccount(account)
  }

  public deleteProviderAccount(accountId: string): void {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    this.configDataService.deleteProviderAccount(accountId)
  }

  public saveProviderModel(accountId: string, model: AccountModel): void {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    this.configDataService.saveProviderModel(accountId, model)
  }

  public deleteProviderModel(accountId: string, modelId: string): void {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    this.configDataService.deleteProviderModel(accountId, modelId)
  }

  public setProviderModelEnabled(accountId: string, modelId: string, enabled: boolean): void {
    if (!this.configDataService) throw new Error('Config data service not initialized')
    this.configDataService.setProviderModelEnabled(accountId, modelId, enabled)
  }

  /**
   * 检查数据库是否就绪
   */
  public isReady(): boolean {
    return this.isInitialized
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    if (this.db) {
      this.dbCore.close()
      this.db = null
      this.configRepo = undefined
      this.providerRepo = undefined
      this.chatRepo = undefined
      this.chatSkillRepo = undefined
      this.messageRepo = undefined
      this.summaryRepo = undefined
      this.submitEventRepo = undefined
      this.assistantRepo = undefined
      this.taskPlanRepo = undefined
      this.scheduledTaskRepo = undefined
      this.chatDataService = undefined
      this.messageDataService = undefined
      this.planDataService = undefined
      this.scheduledTaskDataService = undefined
      this.configDataService = undefined
      this.compressedSummaryDataService = undefined
      this.chatSubmitEventDataService = undefined
      this.assistantDataService = undefined
      this.isInitialized = false
      console.log('[DatabaseService] Database closed')
    }
  }

  // ==================== ChatSubmitEventTrace Methods ====================

  /**
   * 保存 chat submit 事件轨迹
   */
  public saveChatSubmitEvent(data: ChatSubmitEventTrace): number {
    if (!this.chatSubmitEventDataService) throw new Error('Chat submit event data service not initialized')
    return this.chatSubmitEventDataService.saveChatSubmitEvent(data)
  }

  // ==================== CompressedSummary Methods ====================

  public saveCompressedSummary(data: CompressedSummaryEntity): number {
    if (!this.compressedSummaryDataService) throw new Error('Compressed summary data service not initialized')
    return this.compressedSummaryDataService.saveCompressedSummary(data)
  }

  public getCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    if (!this.compressedSummaryDataService) throw new Error('Compressed summary data service not initialized')
    return this.compressedSummaryDataService.getCompressedSummariesByChatId(chatId)
  }

  public getActiveCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    if (!this.compressedSummaryDataService) throw new Error('Compressed summary data service not initialized')
    return this.compressedSummaryDataService.getActiveCompressedSummariesByChatId(chatId)
  }

  public updateCompressedSummaryStatus(id: number, status: 'active' | 'superseded' | 'invalid'): void {
    if (!this.compressedSummaryDataService) throw new Error('Compressed summary data service not initialized')
    this.compressedSummaryDataService.updateCompressedSummaryStatus(id, status)
  }

  public deleteCompressedSummary(id: number): void {
    if (!this.compressedSummaryDataService) throw new Error('Compressed summary data service not initialized')
    this.compressedSummaryDataService.deleteCompressedSummary(id)
  }

  // ==================== Assistant Methods ====================

  public saveAssistant(assistant: Assistant): string {
    if (!this.assistantDataService) throw new Error('Assistant data service not initialized')
    return this.assistantDataService.saveAssistant(assistant)
  }

  public getAllAssistants(): Assistant[] {
    if (!this.assistantDataService) throw new Error('Assistant data service not initialized')
    return this.assistantDataService.getAllAssistants()
  }

  public deleteAllAssistants(): void {
    if (!this.assistantDataService) throw new Error('Assistant data service not initialized')
    this.assistantDataService.deleteAllAssistants()
  }

  public getAssistantById(id: string): Assistant | undefined {
    if (!this.assistantDataService) throw new Error('Assistant data service not initialized')
    return this.assistantDataService.getAssistantById(id)
  }

  public updateAssistant(assistant: Assistant): void {
    if (!this.assistantDataService) throw new Error('Assistant data service not initialized')
    this.assistantDataService.updateAssistant(assistant)
  }

  public deleteAssistant(id: string): void {
    if (!this.assistantDataService) throw new Error('Assistant data service not initialized')
    this.assistantDataService.deleteAssistant(id)
  }
}

// 导出单例实例
export default DatabaseService.getInstance()
