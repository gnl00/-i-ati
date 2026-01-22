/**
 * DatabaseService - 聊天和消息数据库服务
 * 使用 SQLite 持久化存储，在主进程中运行
 * 参考 MemoryService 的实现模式
 */

import { app } from 'electron'
import path from 'path'
import * as fs from 'fs'
import { AppDatabase } from '../db/Database'
import { ConfigRepository } from '../db/repositories/ConfigRepository'
import { ProviderRepository } from '../db/repositories/ProviderRepository'
import { ChatRepository } from '../db/repositories/ChatRepository'
import { ChatSkillRepository } from '../db/repositories/ChatSkillRepository'
import { MessageRepository } from '../db/repositories/MessageRepository'
import { CompressedSummaryRepository, CompressedSummaryRow } from '../db/repositories/CompressedSummaryRepository'
import { ChatSubmitEventRepository } from '../db/repositories/ChatSubmitEventRepository'
import { AssistantRepository, AssistantRow } from '../db/repositories/AssistantRepository'


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
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatRepo) throw new Error('Chat repository not initialized')

    const now = Date.now()
    const row = {
      id: data.id ?? 0,
      uuid: data.uuid,
      title: data.title,
      msg_count: data.msgCount ?? 0,
      model: data.model ?? null,
      workspace_path: data.workspacePath ?? null,
      create_time: data.createTime ?? now,
      update_time: data.updateTime ?? now
    }
    return this.chatRepo.insertChat(row)
  }

  public getAllChats(): ChatEntity[] {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatRepo) throw new Error('Chat repository not initialized')

    const rows = this.chatRepo.getAllChats()
    return rows.map(row => ({
      id: row.id,
      uuid: row.uuid,
      title: row.title,
      msgCount: row.msg_count,
      model: row.model ?? undefined,
      workspacePath: row.workspace_path ?? undefined,
      createTime: row.create_time,
      updateTime: row.update_time,
      messages: []
    }))
  }

  public getChatById(id: number): ChatEntity | undefined {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatRepo) throw new Error('Chat repository not initialized')

    const row = this.chatRepo.getChatById(id)
    if (!row) return undefined
    return {
      id: row.id,
      uuid: row.uuid,
      title: row.title,
      msgCount: row.msg_count,
      model: row.model ?? undefined,
      workspacePath: row.workspace_path ?? undefined,
      createTime: row.create_time,
      updateTime: row.update_time,
      messages: []
    }
  }

  public getChatByUuid(uuid: string): ChatEntity | undefined {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatRepo) throw new Error('Chat repository not initialized')

    const row = this.chatRepo.getChatByUuid(uuid)
    if (!row) return undefined
    return {
      id: row.id,
      uuid: row.uuid,
      title: row.title,
      msgCount: row.msg_count,
      model: row.model ?? undefined,
      workspacePath: row.workspace_path ?? undefined,
      createTime: row.create_time,
      updateTime: row.update_time,
      messages: []
    }
  }

  public getWorkspacePathByUuid(uuid: string): string | undefined {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatRepo) throw new Error('Chat repository not initialized')
    return this.chatRepo.getWorkspacePathByUuid(uuid)
  }

  public updateChat(data: ChatEntity): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatRepo) throw new Error('Chat repository not initialized')
    if (!data.id) return

    const row = {
      id: data.id,
      uuid: data.uuid,
      title: data.title,
      msg_count: data.msgCount ?? 0,
      model: data.model ?? null,
      workspace_path: data.workspacePath ?? null,
      create_time: data.createTime ?? Date.now(),
      update_time: data.updateTime ?? Date.now()
    }
    this.chatRepo.updateChat(row)
  }

  public deleteChat(id: number): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatRepo) throw new Error('Chat repository not initialized')
    this.chatRepo.deleteChat(id)
  }

  public getChatSkills(chatId: number): string[] {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatSkillRepo) throw new Error('Chat skill repository not initialized')

    const rows = this.chatSkillRepo.getChatSkills(chatId)
    return rows.map(row => row.skill_name)
  }

  public addChatSkill(chatId: number, skillName: string): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatSkillRepo) throw new Error('Chat skill repository not initialized')
    this.chatSkillRepo.addChatSkill(chatId, skillName)
  }

  public removeChatSkill(chatId: number, skillName: string): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.chatSkillRepo) throw new Error('Chat skill repository not initialized')
    this.chatSkillRepo.removeChatSkill(chatId, skillName)
  }

  public saveMessage(data: MessageEntity): number {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.messageRepo) throw new Error('Message repository not initialized')

    const row = {
      chat_id: data.chatId ?? null,
      chat_uuid: data.chatUuid ?? null,
      body: JSON.stringify(data.body),
      tokens: data.tokens ?? null
    }
    return this.messageRepo.insertMessage(row)
  }

  public getAllMessages(): MessageEntity[] {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.messageRepo) throw new Error('Message repository not initialized')

    const rows = this.messageRepo.getAllMessages()
    return rows.map(row => ({
      id: row.id,
      chatId: row.chat_id ?? undefined,
      chatUuid: row.chat_uuid ?? undefined,
      body: JSON.parse(row.body),
      tokens: row.tokens ?? undefined
    }))
  }

  public getMessageById(id: number): MessageEntity | undefined {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.messageRepo) throw new Error('Message repository not initialized')

    const row = this.messageRepo.getMessageById(id)
    if (!row) return undefined
    return {
      id: row.id,
      chatId: row.chat_id ?? undefined,
      chatUuid: row.chat_uuid ?? undefined,
      body: JSON.parse(row.body),
      tokens: row.tokens ?? undefined
    }
  }

  public getMessagesByChatId(chatId: number): MessageEntity[] {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.messageRepo) throw new Error('Message repository not initialized')

    const rows = this.messageRepo.getMessagesByChatId(chatId)
    return rows.map(row => ({
      id: row.id,
      chatId: row.chat_id ?? undefined,
      chatUuid: row.chat_uuid ?? undefined,
      body: JSON.parse(row.body),
      tokens: row.tokens ?? undefined
    }))
  }

  public getMessagesByChatUuid(chatUuid: string): MessageEntity[] {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.messageRepo) throw new Error('Message repository not initialized')

    const rows = this.messageRepo.getMessagesByChatUuid(chatUuid)
    return rows.map(row => ({
      id: row.id,
      chatId: row.chat_id ?? undefined,
      chatUuid: row.chat_uuid ?? undefined,
      body: JSON.parse(row.body),
      tokens: row.tokens ?? undefined
    }))
  }

  public getMessageByIds(ids: number[]): MessageEntity[] {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.messageRepo) throw new Error('Message repository not initialized')

    const rows = this.messageRepo.getMessageByIds(ids)
    return rows.map(row => ({
      id: row.id,
      chatId: row.chat_id ?? undefined,
      chatUuid: row.chat_uuid ?? undefined,
      body: JSON.parse(row.body),
      tokens: row.tokens ?? undefined
    }))
  }

  public updateMessage(data: MessageEntity): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.messageRepo) throw new Error('Message repository not initialized')
    if (!data.id) return

    this.messageRepo.updateMessage({
      id: data.id,
      chat_id: data.chatId ?? null,
      chat_uuid: data.chatUuid ?? null,
      body: JSON.stringify(data.body),
      tokens: data.tokens ?? null
    })
  }

  public deleteMessage(id: number): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.messageRepo) throw new Error('Message repository not initialized')
    this.messageRepo.deleteMessage(id)
  }

  /**
   * 加载默认的 provider definitions
   */
  private loadProviderDefinitions(): ProviderDefinition[] {
    try {
      // 获取项目根目录
      // 在开发环境中，__dirname 类似于: /path/to/project/out/main
      // 我们需要回到项目根目录，然后访问 src/data/providers.json
      const projectRoot = app.getAppPath()

      // 在开发环境和生产环境中查找 providers.json
      const possiblePaths = [
        // 开发环境路径（使用 app.getAppPath()）
        path.join(projectRoot, 'src/data/providers.json'),
        path.join(projectRoot, '../src/data/providers.json'),
        // 生产环境路径
        path.join(process.resourcesPath, 'app.asar.unpacked/data/providers.json'),
        path.join(process.resourcesPath, 'app/data/providers.json'),
        path.join(process.resourcesPath, 'data/providers.json'),
      ]

      // console.log('[DatabaseService] Project root:', projectRoot)
      // console.log('[DatabaseService] Searching for providers.json in:')
      for (const filePath of possiblePaths) {
        // console.log(`  - ${filePath} (exists: ${fs.existsSync(filePath)})`)
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf-8')
          // console.log(`[DatabaseService] ✓ Loaded provider definitions from: ${filePath}`)
          return JSON.parse(data) as ProviderDefinition[]
        }
      }

      // console.warn('[DatabaseService] ⚠ providers.json not found in any path, using empty array')
      return []
    } catch (error) {
      // console.error('[DatabaseService] Failed to load provider definitions:', error)
      return []
    }
  }

  // ==================== Config 操作 ====================

  /**
   * 获取配置
   */
  public getConfig(): IAppConfig | undefined {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const row = this.configRepo?.getConfig()
      if (!row) return undefined

      const config = JSON.parse(row.value) as IAppConfig
      const providerDefinitions = this.getProviderDefinitionsFromDb()
      const accounts = this.getProviderAccountsFromDb()

      return {
        ...config,
        providerDefinitions,
        accounts
      }
    } catch (error) {
      console.error('[DatabaseService] Failed to get config:', error)
      throw error
    }
  }

  /**
   * 保存配置
   */
  public saveConfig(config: IAppConfig): void {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const hasDefinitions = Object.prototype.hasOwnProperty.call(config, 'providerDefinitions')
      const hasAccounts = Object.prototype.hasOwnProperty.call(config, 'accounts')
      if (hasDefinitions) {
        const providerDefinitions = config.providerDefinitions ?? []
        this.saveProviderDefinitionsToDb(providerDefinitions)
      }
      if (hasAccounts) {
        const accounts = config.accounts ?? []
        this.saveProviderAccountsToDb(accounts)
      }

      const { providerDefinitions: _defs, accounts: _accounts, ...baseConfig } = config
      this.configRepo?.saveConfig(
        JSON.stringify(baseConfig),
        baseConfig.version ?? null
      )
      console.log('[DatabaseService] Saved config')
    } catch (error) {
      console.error('[DatabaseService] Failed to save config:', error)
      throw error
    }
  }

  /**
   * 检查数据库是否就绪
   */
  public isReady(): boolean {
    return this.isInitialized
  }

  /**
   * 获取指定 key 的配置值
   */
  public getConfigValue(key: string): string | undefined {
    if (!this.db) throw new Error('Database not initialized')
    if (!key) return undefined

    try {
      return this.configRepo?.getValue(key)
    } catch (error) {
      console.error('[DatabaseService] Failed to get config value:', error)
      throw error
    }
  }

  /**
   * 保存指定 key 的配置值
   */
  public saveConfigValue(key: string, value: string, version?: number | null): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!key) return

    try {
      this.configRepo?.saveValue(key, value, version ?? null)
    } catch (error) {
      console.error('[DatabaseService] Failed to save config value:', error)
      throw error
    }
  }

  /**
   * 初始化配置（首次使用或版本升级）
   */
  public initConfig(): IAppConfig {
    if (!this.db) throw new Error('Database not initialized')

    try {
      // 加载默认 provider definitions
      const defaultProviderDefinitions = this.loadProviderDefinitions()
      const normalizedDefaults = this.normalizeProviderDefinitions(defaultProviderDefinitions)
      const defaultProviderList = normalizedDefaults.definitions
      console.log(`[DatabaseService] Loaded ${defaultProviderList.length} provider definitions`)

      // 默认配置
      const defaultConfig: IAppConfig = {
        version: 2.0,
        tools: {
          maxWebSearchItems: 3
        },
        configForUpdate: {
          version: 2.0,
        }
      }

      let config = this.getConfig()
      console.log('[DatabaseService] Existing config:', config ? 'found' : 'not found')

      if (!config) {
        // 首次使用，使用默认配置
        console.log('[DatabaseService] First time use, saving default config with', defaultProviderList.length, 'provider definitions')
        this.saveConfig(defaultConfig)
        this.ensureProviderDefinitions(defaultProviderList)
        console.log('[DatabaseService] Initialized with default config, providerDefinitions count:', defaultProviderList.length)
        return {
          ...defaultConfig,
          providerDefinitions: this.getProviderDefinitionsFromDb(),
          accounts: this.getProviderAccountsFromDb()
        }
      }

      console.log('[DatabaseService] Existing config version:', config.version, 'default version:', defaultConfig.version)
      const providerCount = this.providerRepo?.countProviderDefinitions() ?? 0
      if (providerCount === 0) {
        this.ensureProviderDefinitions(defaultProviderList)
        console.log('[DatabaseService] Seeded provider definitions from defaults')
      }

      if (defaultConfig.version! > config.version!) {
        const nextConfig = {
          ...config,
          ...defaultConfig.configForUpdate,
          version: defaultConfig.version
        }
        this.saveConfig(nextConfig)
        config = nextConfig
        console.log(`[DatabaseService] Upgraded config from ${config.version} to ${defaultConfig.version}`)
      }

      console.log('[DatabaseService] Returning existing config, providerDefinitions count:', this.getProviderDefinitionsFromDb().length)
      return {
        ...config,
        providerDefinitions: this.getProviderDefinitionsFromDb(),
        accounts: this.getProviderAccountsFromDb()
      }
    } catch (error) {
      console.error('[DatabaseService] Failed to init config:', error)
      throw error
    }
  }

  private normalizeProviderId(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '-')
  }

  private normalizeProviderDefinitions(
    definitions: ProviderDefinition[]
  ): { definitions: ProviderDefinition[]; changed: boolean } {
    const byId = new Map<string, ProviderDefinition>()
    let changed = false

    definitions.forEach(def => {
      const normalizedId = this.normalizeProviderId(def.id || def.displayName || '')
      if (!normalizedId) {
        return
      }
      const nextDef = normalizedId === def.id ? def : { ...def, id: normalizedId }
      if (normalizedId !== def.id) {
        changed = true
      }
      if (byId.has(normalizedId)) {
        changed = true
        return
      }
      byId.set(normalizedId, nextDef)
    })

    return { definitions: Array.from(byId.values()), changed }
  }


  private getProviderDefinitionsFromDb(): ProviderDefinition[] {
    if (!this.db) throw new Error('Database not initialized')

    const rows = this.providerRepo?.getProviderDefinitions() ?? []
    return rows.map(row => {
      let requestOverrides: Record<string, any> | undefined
      if (row.request_overrides) {
        try {
          requestOverrides = JSON.parse(row.request_overrides)
        } catch {
          requestOverrides = undefined
        }
      }
      return {
        id: row.id,
        displayName: row.display_name,
        adapterType: row.adapter_type as ProviderType,
        apiVersion: row.api_version ?? undefined,
        iconKey: row.icon_key ?? undefined,
        defaultApiUrl: row.default_api_url ?? undefined,
        requestOverrides
      }
    })
  }

  private getProviderAccountsFromDb(): ProviderAccount[] {
    if (!this.db) throw new Error('Database not initialized')

    const accountRows = this.providerRepo?.getProviderAccounts() ?? []
    const modelRows = this.providerRepo?.getProviderModels() ?? []
    const modelsByAccount = new Map<string, AccountModel[]>()

    modelRows.forEach(row => {
      const models = modelsByAccount.get(row.account_id) || []
      models.push({
        id: row.model_id,
        label: row.label,
        type: row.type as ModelType,
        enabled: row.enabled === 1
      })
      modelsByAccount.set(row.account_id, models)
    })

    return accountRows.map(row => ({
      id: row.id,
      providerId: row.provider_id,
      label: row.label,
      apiUrl: row.api_url,
      apiKey: row.api_key,
      models: modelsByAccount.get(row.id) || []
    }))
  }

  private ensureProviderDefinitions(definitions: ProviderDefinition[]): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!definitions.length) return

    const normalized = this.normalizeProviderDefinitions(definitions).definitions
    const now = Date.now()
    const tx = this.db.transaction(() => {
      normalized.forEach(def => {
        this.providerRepo?.upsertProviderDefinition({
          id: def.id,
          display_name: def.displayName,
          adapter_type: def.adapterType,
          api_version: def.apiVersion ?? null,
          icon_key: def.iconKey ?? null,
          default_api_url: def.defaultApiUrl ?? null,
          request_overrides: def.requestOverrides ? JSON.stringify(def.requestOverrides) : null,
          created_at: now,
          updated_at: now
        })
      })
    })
    tx()
  }

  private saveProviderDefinitionsToDb(definitions: ProviderDefinition[]): void {
    if (!this.db) throw new Error('Database not initialized')

    const normalized = this.normalizeProviderDefinitions(definitions).definitions
    const existingRows = this.providerRepo?.getProviderDefinitions() ?? []
    const existingIds = new Set(existingRows.map(row => row.id))
    const incomingIds = new Set(normalized.map(def => def.id))
    const now = Date.now()

    const tx = this.db.transaction(() => {
      normalized.forEach(def => {
        this.providerRepo?.upsertProviderDefinition({
          id: def.id,
          display_name: def.displayName,
          adapter_type: def.adapterType,
          api_version: def.apiVersion ?? null,
          icon_key: def.iconKey ?? null,
          default_api_url: def.defaultApiUrl ?? null,
          request_overrides: def.requestOverrides ? JSON.stringify(def.requestOverrides) : null,
          created_at: now,
          updated_at: now
        })
      })

      existingIds.forEach(id => {
        if (incomingIds.has(id)) return
        const accountRows = this.db!.prepare('SELECT id FROM provider_accounts WHERE provider_id = ?')
          .all(id) as { id: string }[]
        accountRows.forEach(row => {
          this.providerRepo?.deleteProviderModelsByAccountId(row.id)
        })
        this.providerRepo?.deleteProviderAccountsByProviderId(id)
        this.providerRepo?.deleteProviderDefinition(id)
      })
    })
    tx()
  }

  private saveProviderAccountsToDb(accounts: ProviderAccount[]): void {
    if (!this.db) throw new Error('Database not initialized')

    const existingRows = this.providerRepo?.getProviderAccounts() ?? []
    const existingIds = new Set(existingRows.map(row => row.id))
    const incomingIds = new Set(accounts.map(account => account.id))
    const now = Date.now()

    const tx = this.db.transaction(() => {
      accounts.forEach(account => {
        this.assertProviderExists(account.providerId)
        this.providerRepo?.upsertProviderAccount({
          id: account.id,
          provider_id: account.providerId,
          label: account.label,
          api_url: account.apiUrl,
          api_key: account.apiKey,
          created_at: now,
          updated_at: now
        })

        const models = account.models || []
        const existingModelRows = this.db!.prepare('SELECT model_id FROM provider_models WHERE account_id = ?')
          .all(account.id) as { model_id: string }[]
        const existingModelIds = new Set(existingModelRows.map(row => row.model_id))
        const incomingModelIds = new Set(models.map(model => model.id))

        models.forEach(model => {
          this.providerRepo?.upsertProviderModel({
            account_id: account.id,
            model_id: model.id,
            label: model.label,
            type: model.type,
            enabled: model.enabled ? 1 : 0,
            created_at: now,
            updated_at: now
          })
        })

        existingModelIds.forEach(modelId => {
          if (incomingModelIds.has(modelId)) return
          this.providerRepo?.deleteProviderModel(account.id, modelId)
        })
      })

      existingIds.forEach(id => {
        if (incomingIds.has(id)) return
        this.providerRepo?.deleteProviderModelsByAccountId(id)
        this.providerRepo?.deleteProviderAccount(id)
      })
    })
    tx()
  }

  public getProviderDefinitions(): ProviderDefinition[] {
    return this.getProviderDefinitionsFromDb()
  }

  public saveProviderDefinition(definition: ProviderDefinition): void {
    if (!this.db) throw new Error('Database not initialized')

    const normalized = this.normalizeProviderDefinitions([definition]).definitions[0]
    if (!normalized) return
    const now = Date.now()
    this.providerRepo?.upsertProviderDefinition({
      id: normalized.id,
      display_name: normalized.displayName,
      adapter_type: normalized.adapterType,
      api_version: normalized.apiVersion ?? null,
      icon_key: normalized.iconKey ?? null,
      default_api_url: normalized.defaultApiUrl ?? null,
      created_at: now,
      updated_at: now
    })
  }

  public deleteProviderDefinition(providerId: string): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!providerId) return

    const accountRows = this.db.prepare('SELECT id FROM provider_accounts WHERE provider_id = ?')
      .all(providerId) as { id: string }[]
    accountRows.forEach(row => {
      this.providerRepo?.deleteProviderModelsByAccountId(row.id)
    })
    this.providerRepo?.deleteProviderAccountsByProviderId(providerId)
    this.providerRepo?.deleteProviderDefinition(providerId)
  }

  public getProviderAccounts(): ProviderAccount[] {
    return this.getProviderAccountsFromDb()
  }

  public saveProviderAccount(account: ProviderAccount): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!account?.id) return

    this.assertProviderExists(account.providerId)
    const now = Date.now()
    const tx = this.db.transaction(() => {
      this.providerRepo?.upsertProviderAccount({
        id: account.id,
        provider_id: account.providerId,
        label: account.label,
        api_url: account.apiUrl,
        api_key: account.apiKey,
        created_at: now,
        updated_at: now
      })

      const models = account.models || []
      const existingRows = this.db!.prepare('SELECT model_id FROM provider_models WHERE account_id = ?')
        .all(account.id) as { model_id: string }[]
      const existingIds = new Set(existingRows.map(row => row.model_id))
      const incomingIds = new Set(models.map(model => model.id))

      models.forEach(model => {
        this.providerRepo?.upsertProviderModel({
          account_id: account.id,
          model_id: model.id,
          label: model.label,
          type: model.type,
          enabled: model.enabled ? 1 : 0,
          created_at: now,
          updated_at: now
        })
      })

      existingIds.forEach(modelId => {
        if (incomingIds.has(modelId)) return
        this.providerRepo?.deleteProviderModel(account.id, modelId)
      })
    })
    tx()
  }

  public deleteProviderAccount(accountId: string): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!accountId) return

    this.providerRepo?.deleteProviderModelsByAccountId(accountId)
    this.providerRepo?.deleteProviderAccount(accountId)
  }

  public saveProviderModel(accountId: string, model: AccountModel): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!accountId || !model?.id) return

    const now = Date.now()
    this.providerRepo?.upsertProviderModel({
      account_id: accountId,
      model_id: model.id,
      label: model.label,
      type: model.type,
      enabled: model.enabled ? 1 : 0,
      created_at: now,
      updated_at: now
    })
  }

  public deleteProviderModel(accountId: string, modelId: string): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!accountId || !modelId) return

    this.providerRepo?.deleteProviderModel(accountId, modelId)
  }

  public setProviderModelEnabled(accountId: string, modelId: string, enabled: boolean): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!accountId || !modelId) return

    this.providerRepo?.updateProviderModelEnabled(accountId, modelId, enabled ? 1 : 0)
  }

  private assertProviderExists(providerId: string): void {
    if (!providerId) {
      throw new Error('ProviderId is required')
    }
    const row = this.providerRepo?.getProviderDefinitionById(providerId)
    if (!row) {
      throw new Error(`Provider not found for providerId: ${providerId}`)
    }
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
      this.isInitialized = false
      console.log('[DatabaseService] Database closed')
    }
  }

  // ==================== ChatSubmitEventTrace Methods ====================

  /**
   * 保存 chat submit 事件轨迹
   */
  public saveChatSubmitEvent(data: ChatSubmitEventTrace): number {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.submitEventRepo) throw new Error('Chat submit event repository not initialized')

    try {
      return this.submitEventRepo.insert({
        submission_id: data.submissionId,
        chat_id: data.chatId ?? null,
        chat_uuid: data.chatUuid ?? null,
        sequence: data.sequence,
        type: data.type,
        timestamp: data.timestamp,
        payload: data.payload ? JSON.stringify(data.payload) : null,
        meta: data.meta ? JSON.stringify(data.meta) : null
      })
    } catch (error) {
      console.error('[DatabaseService] Failed to save chat submit event:', error)
      throw error
    }
  }

  // ==================== CompressedSummary Methods ====================

  /**
   * 将数据库行转换为 CompressedSummaryEntity
   */
  private rowToCompressedSummaryEntity(row: CompressedSummaryRow): CompressedSummaryEntity {
    return {
      id: row.id,
      chatId: row.chat_id,
      chatUuid: row.chat_uuid,
      messageIds: JSON.parse(row.message_ids),
      startMessageId: row.start_message_id,
      endMessageId: row.end_message_id,
      summary: row.summary,
      originalTokenCount: row.original_token_count ?? undefined,
      summaryTokenCount: row.summary_token_count ?? undefined,
      compressionRatio: row.compression_ratio ?? undefined,
      compressedAt: row.compressed_at,
      compressionModel: row.compression_model ?? undefined,
      compressionVersion: row.compression_version ?? undefined,
      status: (row.status as 'active' | 'superseded' | 'invalid') ?? 'active'
    }
  }

  /**
   * 保存压缩摘要
   */
  public saveCompressedSummary(data: CompressedSummaryEntity): number {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.summaryRepo) throw new Error('Compressed summary repository not initialized')

    try {
      const id = this.summaryRepo.insert({
        chat_id: data.chatId,
        chat_uuid: data.chatUuid,
        message_ids: JSON.stringify(data.messageIds),
        start_message_id: data.startMessageId,
        end_message_id: data.endMessageId,
        summary: data.summary,
        original_token_count: data.originalTokenCount ?? null,
        summary_token_count: data.summaryTokenCount ?? null,
        compression_ratio: data.compressionRatio ?? null,
        compressed_at: data.compressedAt,
        compression_model: data.compressionModel ?? null,
        compression_version: data.compressionVersion ?? 1,
        status: data.status ?? 'active'
      })
      console.log(`[DatabaseService] Saved compressed summary: ${id}`)
      return id
    } catch (error) {
      console.error('[DatabaseService] Failed to save compressed summary:', error)
      throw error
    }
  }

  /**
   * 获取聊天的所有压缩摘要
   */
  public getCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.summaryRepo) throw new Error('Compressed summary repository not initialized')

    try {
      const rows = this.summaryRepo.getByChatId(chatId)
      return rows.map(row => this.rowToCompressedSummaryEntity(row))
    } catch (error) {
      console.error('[DatabaseService] Failed to get compressed summaries:', error)
      throw error
    }
  }

  /**
   * 获取聊天的活跃压缩摘要
   */
  public getActiveCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.summaryRepo) throw new Error('Compressed summary repository not initialized')

    try {
      const rows = this.summaryRepo.getActiveByChatId(chatId)
      return rows.map(row => this.rowToCompressedSummaryEntity(row))
    } catch (error) {
      console.error('[DatabaseService] Failed to get active compressed summaries:', error)
      throw error
    }
  }

  /**
   * 更新压缩摘要状态
   */
  public updateCompressedSummaryStatus(id: number, status: 'active' | 'superseded' | 'invalid'): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.summaryRepo) throw new Error('Compressed summary repository not initialized')

    try {
      this.summaryRepo.updateStatus(id, status)
      console.log(`[DatabaseService] Updated compressed summary status: ${id} -> ${status}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to update compressed summary status:', error)
      throw error
    }
  }

  /**
   * 删除压缩摘要
   */
  public deleteCompressedSummary(id: number): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.summaryRepo) throw new Error('Compressed summary repository not initialized')

    try {
      this.summaryRepo.delete(id)
      console.log(`[DatabaseService] Deleted compressed summary: ${id}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to delete compressed summary:', error)
      throw error
    }
  }

  // ==================== Assistant Methods ====================

  /**
   * 将数据库行转换为 Assistant
   */
  private rowToAssistant(row: AssistantRow): Assistant {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon || undefined,
      description: row.description || undefined,
      modelRef: {
        accountId: row.model_account_id,
        modelId: row.model_model_id
      },
      systemPrompt: row.system_prompt,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isBuiltIn: row.is_built_in === 1,
      isDefault: row.is_default === 1
    }
  }

  /**
   * 保存 Assistant
   */
  public saveAssistant(assistant: Assistant): string {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.assistantRepo) throw new Error('Assistant repository not initialized')

    try {
      this.assistantRepo.insert({
        id: assistant.id,
        name: assistant.name,
        icon: assistant.icon || null,
        description: assistant.description || null,
        model_account_id: assistant.modelRef.accountId,
        model_model_id: assistant.modelRef.modelId,
        system_prompt: assistant.systemPrompt,
        created_at: assistant.createdAt,
        updated_at: assistant.updatedAt,
        is_built_in: assistant.isBuiltIn ? 1 : 0,
        is_default: assistant.isDefault ? 1 : 0
      })
      console.log(`[DatabaseService] Saved assistant: ${assistant.id}`)
      return assistant.id
    } catch (error) {
      console.error('[DatabaseService] Failed to save assistant:', error)
      throw error
    }
  }

  /**
   * 获取所有 Assistants
   */
  public getAllAssistants(): Assistant[] {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.assistantRepo) throw new Error('Assistant repository not initialized')

    try {
      const rows = this.assistantRepo.getAll()
      return rows.map(row => this.rowToAssistant(row))
    } catch (error) {
      console.error('[DatabaseService] Failed to get all assistants:', error)
      throw error
    }
  }

  /**
   * 删除所有 Assistants
   */
  public deleteAllAssistants(): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.assistantRepo) throw new Error('Assistant repository not initialized')

    try {
      this.assistantRepo.deleteAll()
      console.log('[DatabaseService] Deleted all assistants')
    } catch (error) {
      console.error('[DatabaseService] Failed to delete all assistants:', error)
      throw error
    }
  }

  /**
   * 根据 ID 获取 Assistant
   */
  public getAssistantById(id: string): Assistant | undefined {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.assistantRepo) throw new Error('Assistant repository not initialized')

    try {
      const row = this.assistantRepo.getById(id)
      return row ? this.rowToAssistant(row) : undefined
    } catch (error) {
      console.error('[DatabaseService] Failed to get assistant by id:', error)
      throw error
    }
  }

  /**
   * 更新 Assistant
   */
  public updateAssistant(assistant: Assistant): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.assistantRepo) throw new Error('Assistant repository not initialized')

    try {
      this.assistantRepo.update({
        id: assistant.id,
        name: assistant.name,
        icon: assistant.icon || null,
        description: assistant.description || null,
        model_account_id: assistant.modelRef.accountId,
        model_model_id: assistant.modelRef.modelId,
        system_prompt: assistant.systemPrompt,
        created_at: assistant.createdAt ?? Date.now(),
        updated_at: assistant.updatedAt,
        is_built_in: assistant.isBuiltIn ? 1 : 0,
        is_default: assistant.isDefault ? 1 : 0
      })
      console.log(`[DatabaseService] Updated assistant: ${assistant.id}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to update assistant:', error)
      throw error
    }
  }

  /**
   * 删除 Assistant
   */
  public deleteAssistant(id: string): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!this.assistantRepo) throw new Error('Assistant repository not initialized')

    try {
      this.assistantRepo.delete(id)
      console.log(`[DatabaseService] Deleted assistant: ${id}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to delete assistant:', error)
      throw error
    }
  }
}

// 导出单例实例
export default DatabaseService.getInstance()
