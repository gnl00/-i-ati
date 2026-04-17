/**
 * DatabaseService - main-process database facade.
 * Keeps the legacy singleton API stable while delegating db runtime assembly to DbRuntime.
 */

import { DbRuntime } from '../core/DbRuntime'
import { DbAppServices } from './DbAppServices'
import { ScheduledTaskRow } from '../dao/ScheduledTaskDao'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'
import { createLogger } from '@main/logging/LogService'
import type { HistorySearchArgs, HistorySearchItem } from '@tools/history/index.d'


/**
 * SQLite 数据库服务
 */
class DatabaseService {
  private static instance: DatabaseService
  private readonly logger = createLogger('DatabaseService')
  private dbRuntime?: DbRuntime
  private appServices?: DbAppServices

  private constructor() {}

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
    if (this.dbRuntime?.isReady()) {
      return
    }

    let runtime: DbRuntime | undefined

    try {
      this.logger.info('initialize.start')

      runtime = this.dbRuntime ?? new DbRuntime()
      const stats = runtime.initialize()
      this.dbRuntime = runtime
      this.appServices = new DbAppServices(runtime)

      this.logger.info('initialize.completed', stats)

      // 初始化内置 Assistants
      const { initializeBuiltInAssistants } = await import('@main/bootstrap/AssistantBootstrap')
      await initializeBuiltInAssistants()
    } catch (error) {
      if (runtime?.isReady()) {
        this.close()
      }
      this.logger.error('initialize.failed', error)
      throw error
    }
  }

  private requireChatService() {
    return this.requireAppServices().chatService
  }

  private requireConfigService() {
    return this.requireAppServices().configService
  }

  private requirePlanningService() {
    return this.requireAppServices().planningService
  }

  private requirePluginService() {
    return this.requireAppServices().pluginService
  }

  private requireRunEventService() {
    return this.requireAppServices().runEventService
  }

  private requireCompressedSummaryService() {
    return this.requireAppServices().compressedSummaryService
  }

  private requireAssistantService() {
    return this.requireAppServices().assistantService
  }

  private requireAppServices(): DbAppServices {
    if (!this.appServices) {
      throw new Error('Application services not initialized')
    }
    return this.appServices
  }

  // ==================== Chat / Message Methods ====================

  public saveChat(data: ChatEntity): number {
    return this.requireChatService().saveChat(data)
  }

  public getAllChats(): ChatEntity[] {
    return this.requireChatService().getAllChats()
  }

  public getChatById(id: number): ChatEntity | undefined {
    return this.requireChatService().getChatById(id)
  }

  public getChatByUuid(uuid: string): ChatEntity | undefined {
    return this.requireChatService().getChatByUuid(uuid)
  }

  public getWorkspacePathByUuid(uuid: string): string | undefined {
    return this.requireChatService().getWorkspacePathByUuid(uuid)
  }

  public updateChat(data: ChatEntity): void {
    this.requireChatService().updateChat(data)
  }

  public deleteChat(id: number): void {
    this.requireChatService().deleteChat(id)
  }

  public getSkills(chatId: number): string[] {
    return this.requireChatService().getSkills(chatId)
  }

  public addSkill(chatId: number, skillName: string): void {
    this.requireChatService().addSkill(chatId, skillName)
  }

  public saveChatHostBinding(data: ChatHostBindingEntity): number {
    return this.requireChatService().saveChatHostBinding(data)
  }

  public upsertChatHostBinding(data: ChatHostBindingEntity): void {
    this.requireChatService().upsertChatHostBinding(data)
  }

  public getChatHostBindingByHost(
    hostType: string,
    hostChatId: string,
    hostThreadId?: string
  ): ChatHostBindingEntity | undefined {
    return this.requireChatService().getChatHostBindingByHost(hostType, hostChatId, hostThreadId)
  }

  public getChatHostBindingsByChatUuid(chatUuid: string): ChatHostBindingEntity[] {
    return this.requireChatService().getChatHostBindingsByChatUuid(chatUuid)
  }

  public updateChatHostBindingLastMessage(id: number, lastHostMessageId?: string): void {
    this.requireChatService().updateChatHostBindingLastMessage(id, lastHostMessageId)
  }

  public updateChatHostBindingStatus(id: number, status: 'active' | 'archived'): void {
    this.requireChatService().updateChatHostBindingStatus(id, status)
  }

  public removeSkill(chatId: number, skillName: string): void {
    this.requireChatService().removeSkill(chatId, skillName)
  }

  public saveMessage(data: MessageEntity): number {
    return this.requireChatService().saveMessage(data)
  }

  public getAllMessages(): MessageEntity[] {
    return this.requireChatService().getAllMessages()
  }

  public getMessageById(id: number): MessageEntity | undefined {
    return this.requireChatService().getMessageById(id)
  }

  public getMessagesByChatId(chatId: number): MessageEntity[] {
    return this.requireChatService().getMessagesByChatId(chatId)
  }

  public getMessagesByChatUuid(chatUuid: string): MessageEntity[] {
    return this.requireChatService().getMessagesByChatUuid(chatUuid)
  }

  public searchChats(args: ChatSearchRequest): ChatSearchResult[] {
    return this.requireChatService().searchChats(args)
  }

  public searchHistory(args: HistorySearchArgs): HistorySearchItem[] {
    return this.requireChatService().searchHistory(args)
  }

  public getMessageByIds(ids: number[]): MessageEntity[] {
    return this.requireChatService().getMessageByIds(ids)
  }

  public updateMessage(data: MessageEntity): void {
    this.requireChatService().updateMessage(data)
  }

  public getEmotionStateByChatId(chatId: number): EmotionStateSnapshot | undefined {
    return this.requireChatService().getEmotionStateByChatId(chatId)
  }

  public getEmotionStateByChatUuid(chatUuid: string): EmotionStateSnapshot | undefined {
    return this.requireChatService().getEmotionStateByChatUuid(chatUuid)
  }

  public upsertEmotionState(chatId: number, chatUuid: string, state: EmotionStateSnapshot): void {
    this.requireChatService().upsertEmotionState(chatId, chatUuid, state)
  }

  public deleteEmotionState(chatId: number): void {
    this.requireChatService().deleteEmotionState(chatId)
  }

  public getWorkContextByChatId(chatId: number): import('../repositories/WorkContextRepository').WorkContextRecord | undefined {
    return this.requireChatService().getWorkContextByChatId(chatId)
  }

  public getWorkContextByChatUuid(chatUuid: string): import('../repositories/WorkContextRepository').WorkContextRecord | undefined {
    return this.requireChatService().getWorkContextByChatUuid(chatUuid)
  }

  public upsertWorkContext(chatId: number, chatUuid: string, content: string): import('../repositories/WorkContextRepository').WorkContextRecord {
    return this.requireChatService().upsertWorkContext(chatId, chatUuid, content)
  }

  public deleteWorkContext(chatId: number): void {
    this.requireChatService().deleteWorkContext(chatId)
  }

  public patchMessageUiState(id: number, uiState: { typewriterCompleted?: boolean }): void {
    this.requireChatService().patchMessageUiState(id, uiState)
  }

  public deleteMessage(id: number): void {
    this.requireChatService().deleteMessage(id)
  }

  // ==================== Task Planner Methods ====================

  public saveTaskPlan(plan: Plan): void {
    this.requirePlanningService().saveTaskPlan(plan)
  }

  public updateTaskPlan(plan: Plan): void {
    this.requirePlanningService().updateTaskPlan(plan)
  }

  public updateTaskPlanStatus(id: string, status: PlanStatus, currentStepId?: string, failureReason?: string): void {
    this.requirePlanningService().updateTaskPlanStatus(id, status, currentStepId, failureReason)
  }

  public getTaskPlanById(id: string): Plan | undefined {
    return this.requirePlanningService().getTaskPlanById(id)
  }

  public getTaskPlansByChatUuid(chatUuid: string): Plan[] {
    return this.requirePlanningService().getTaskPlansByChatUuid(chatUuid)
  }

  public deleteTaskPlan(id: string): void {
    this.requirePlanningService().deleteTaskPlan(id)
  }

  public saveTaskPlanSteps(planId: string, steps: PlanStep[], createdAt?: number, updatedAt?: number): void {
    this.requirePlanningService().saveTaskPlanSteps(planId, steps, createdAt, updatedAt)
  }

  public upsertTaskPlanStep(planId: string, step: PlanStep): void {
    this.requirePlanningService().upsertTaskPlanStep(planId, step)
  }

  public updateTaskPlanStepStatus(
    planId: string,
    stepId: string,
    status: PlanStep['status'],
    output?: unknown,
    error?: string,
    notes?: string
  ): void {
    this.requirePlanningService().updateTaskPlanStepStatus(planId, stepId, status, output, error, notes)
  }

  // ==================== Scheduled Task Methods ====================

  public saveScheduledTask(task: ScheduledTaskRow): void {
    this.requirePlanningService().saveScheduledTask(task)
  }

  public updateScheduledTask(task: ScheduledTaskRow): void {
    this.requirePlanningService().updateScheduledTask(task)
  }

  public updateScheduledTaskStatus(
    id: string,
    status: ScheduleTaskStatus,
    attemptCount: number,
    lastError?: string,
    resultMessageId?: number
  ): void {
    this.requirePlanningService().updateScheduledTaskStatus(id, status, attemptCount, lastError, resultMessageId)
  }

  public getScheduledTaskById(id: string): ScheduledTaskRow | undefined {
    return this.requirePlanningService().getScheduledTaskById(id)
  }

  public getScheduledTasksByChatUuid(chatUuid: string): ScheduledTaskRow[] {
    return this.requirePlanningService().getScheduledTasksByChatUuid(chatUuid)
  }

  public getScheduledTasksByStatus(status: ScheduleTaskStatus, limit: number): ScheduledTaskRow[] {
    return this.requirePlanningService().getScheduledTasksByStatus(status, limit)
  }

  public claimDueScheduledTasks(now: number, limit: number): ScheduledTaskRow[] {
    return this.requirePlanningService().claimDueScheduledTasks(now, limit)
  }

  public deleteScheduledTask(id: string): void {
    this.requirePlanningService().deleteScheduledTask(id)
  }

  // ==================== Config 操作 ====================

  public getConfig(): IAppConfig | undefined {
    return this.requireConfigService().getConfig()
  }

  public saveConfig(config: IAppConfig): void {
    this.requireConfigService().saveConfig(config)
  }

  public getConfigValue(key: string): string | undefined {
    return this.requireConfigService().getConfigValue(key)
  }

  public saveConfigValue(key: string, value: string, version?: number | null): void {
    this.requireConfigService().saveConfigValue(key, value, version)
  }

  public initConfig(): IAppConfig {
    return this.requireConfigService().initConfig()
  }

  public getMcpServerConfig(): McpServerConfig {
    return this.requireConfigService().getMcpServerConfig()
  }

  public saveMcpServerConfig(config: McpServerConfig): void {
    this.requireConfigService().saveMcpServerConfig(config)
  }

  public getPluginConfigs(): AppPluginConfig[] {
    return this.requirePluginService().getPluginConfigs()
  }

  public savePluginConfigs(configs: AppPluginConfig[]): void {
    this.requirePluginService().savePluginConfigs(configs)
  }

  public getPlugins(): PluginEntity[] {
    return this.requirePluginService().getPlugins()
  }

  public async inspectLocalPluginDirectory(sourceDir: string): Promise<import('@main/services/plugins').ScannedLocalPluginManifest> {
    return await this.requirePluginService().inspectLocalPluginDirectory(sourceDir)
  }

  public async rescanLocalPlugins(): Promise<PluginEntity[]> {
    return await this.requirePluginService().rescanLocalPlugins()
  }

  public async importLocalPluginFromDirectory(sourceDir: string): Promise<PluginEntity[]> {
    return await this.requirePluginService().importLocalPluginFromDirectory(sourceDir)
  }

  public async uninstallLocalPlugin(pluginId: string): Promise<PluginEntity[]> {
    return await this.requirePluginService().uninstallLocalPlugin(pluginId)
  }

  public async listRemotePlugins(): Promise<import('@shared/plugins/remoteRegistry').RemotePluginCatalogItem[]> {
    return await this.requirePluginService().listRemotePlugins()
  }

  public async installRemotePlugin(pluginId: string): Promise<PluginEntity[]> {
    return await this.requirePluginService().installRemotePlugin(pluginId)
  }

  public getProviderDefinitions(): ProviderDefinition[] {
    return this.requireConfigService().getProviderDefinitions()
  }

  public saveProviderDefinition(definition: ProviderDefinition): void {
    this.requireConfigService().saveProviderDefinition(definition)
  }

  public deleteProviderDefinition(providerId: string): void {
    this.requireConfigService().deleteProviderDefinition(providerId)
  }

  public getProviderAccounts(): ProviderAccount[] {
    return this.requireConfigService().getProviderAccounts()
  }

  public saveProviderAccount(account: ProviderAccount): void {
    this.requireConfigService().saveProviderAccount(account)
  }

  public deleteProviderAccount(accountId: string): void {
    this.requireConfigService().deleteProviderAccount(accountId)
  }

  public saveProviderModel(accountId: string, model: AccountModel): void {
    this.requireConfigService().saveProviderModel(accountId, model)
  }

  public deleteProviderModel(accountId: string, modelId: string): void {
    this.requireConfigService().deleteProviderModel(accountId, modelId)
  }

  public setProviderModelEnabled(accountId: string, modelId: string, enabled: boolean): void {
    this.requireConfigService().setProviderModelEnabled(accountId, modelId, enabled)
  }

  /**
   * 检查数据库是否就绪
   */
  public isReady(): boolean {
    return this.dbRuntime?.isReady() ?? false
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    if (!this.dbRuntime?.isReady()) {
      return
    }

    this.dbRuntime.close()
    this.dbRuntime = undefined
    this.appServices = undefined
    this.logger.info('database.closed')
  }

  // ==================== RunEventTrace Methods ====================

  /**
   * 保存 run 事件轨迹
   */
  public saveRunEvent(data: RunEventTrace): number {
    return this.requireRunEventService().saveRunEvent(data)
  }

  // ==================== CompressedSummary Methods ====================

  public saveCompressedSummary(data: CompressedSummaryEntity): number {
    return this.requireCompressedSummaryService().saveCompressedSummary(data)
  }

  public getCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    return this.requireCompressedSummaryService().getCompressedSummariesByChatId(chatId)
  }

  public getActiveCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    return this.requireCompressedSummaryService().getActiveCompressedSummariesByChatId(chatId)
  }

  public updateCompressedSummaryStatus(id: number, status: 'active' | 'superseded' | 'invalid'): void {
    this.requireCompressedSummaryService().updateCompressedSummaryStatus(id, status)
  }

  public deleteCompressedSummary(id: number): void {
    this.requireCompressedSummaryService().deleteCompressedSummary(id)
  }

  // ==================== Assistant Methods ====================

  public saveAssistant(assistant: Assistant): string {
    return this.requireAssistantService().saveAssistant(assistant)
  }

  public getAllAssistants(): Assistant[] {
    return this.requireAssistantService().getAllAssistants()
  }

  public deleteAllAssistants(): void {
    this.requireAssistantService().deleteAllAssistants()
  }

  public getAssistantById(id: string): Assistant | undefined {
    return this.requireAssistantService().getAssistantById(id)
  }

  public updateAssistant(assistant: Assistant): void {
    this.requireAssistantService().updateAssistant(assistant)
  }

  public deleteAssistant(id: string): void {
    this.requireAssistantService().deleteAssistant(id)
  }
}

// 导出单例实例
export default DatabaseService.getInstance()
