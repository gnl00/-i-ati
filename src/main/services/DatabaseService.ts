/**
 * DatabaseService - 聊天和消息数据库服务
 * 使用 SQLite 持久化存储，在主进程中运行
 * 参考 MemoryService 的实现模式
 */

import { app } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'
import * as fs from 'fs'

/**
 * 数据库行接口 - Chat
 */
interface ChatRow {
  id: number
  uuid: string
  title: string
  msg_count: number
  model: string | null
  create_time: number
  update_time: number
}

/**
 * 数据库行接口 - Message
 */
interface MessageRow {
  id: number
  chat_id: number | null
  chat_uuid: string | null
  body: string // JSON string
  tokens: number | null
}

/**
 * 数据库行接口 - Config
 */
interface ConfigRow {
  key: string
  value: string // JSON string
  version: number | null
  updated_at: number
}

/**
 * 数据库行接口 - CompressedSummary
 */
interface CompressedSummaryRow {
  id: number
  chat_id: number
  chat_uuid: string
  message_ids: string  // JSON string
  start_message_id: number
  end_message_id: number
  summary: string
  original_token_count: number | null
  summary_token_count: number | null
  compression_ratio: number | null
  compressed_at: number
  compression_model: string | null
  compression_version: number | null
  status: string
}

/**
 * SQLite 数据库服务
 */
class DatabaseService {
  private static instance: DatabaseService
  private db: Database.Database | null = null
  private dbPath: string
  private isInitialized: boolean = false

  // 预编译语句缓存
  private stmts: {
    // Chat statements
    insertChat?: Database.Statement
    getAllChats?: Database.Statement
    getChatById?: Database.Statement
    updateChat?: Database.Statement
    deleteChat?: Database.Statement

    // Message statements
    insertMessage?: Database.Statement
    getAllMessages?: Database.Statement
    getMessageById?: Database.Statement
    updateMessage?: Database.Statement
    deleteMessage?: Database.Statement

    // Config statements
    getConfig?: Database.Statement
    upsertConfig?: Database.Statement

    // CompressedSummary statements
    insertCompressedSummary?: Database.Statement
    getCompressedSummariesByChatId?: Database.Statement
    getActiveCompressedSummariesByChatId?: Database.Statement
    updateCompressedSummaryStatus?: Database.Statement
    deleteCompressedSummary?: Database.Statement
  } = {}

  private constructor() {
    // 数据库存储路径
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'chat.db')
    console.log('[DatabaseService] Database path:', this.dbPath)
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

      // 打开数据库连接
      this.db = new Database(this.dbPath)

      // 启用 WAL 模式以提高并发性能
      this.db.pragma('journal_mode = WAL')

      // 创建表
      this.createTables()

      // 创建索引
      this.createIndexes()

      // 准备常用语句
      this.prepareStatements()

      this.isInitialized = true

      const chatCount = this.db.prepare('SELECT COUNT(*) as count FROM chats').get() as { count: number }
      const messageCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }
      console.log(`[DatabaseService] Initialized with ${chatCount.count} chats and ${messageCount.count} messages`)
    } catch (error) {
      console.error('[DatabaseService] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * 创建数据库表
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized')

    // 创建 chats 表（添加 msg_count 和 model 字段）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        msg_count INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `)

    // 创建 messages 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        chat_uuid TEXT,
        body TEXT NOT NULL,
        tokens INTEGER,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)

    // 创建 configs 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        version INTEGER,
        updated_at INTEGER NOT NULL
      )
    `)

    // 创建 compressed_summaries 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS compressed_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        chat_uuid TEXT NOT NULL,
        message_ids TEXT NOT NULL,
        start_message_id INTEGER NOT NULL,
        end_message_id INTEGER NOT NULL,
        summary TEXT NOT NULL,
        original_token_count INTEGER,
        summary_token_count INTEGER,
        compression_ratio REAL,
        compressed_at INTEGER NOT NULL,
        compression_model TEXT,
        compression_version INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)

    console.log('[DatabaseService] Tables created')
  }

  /**
   * 创建索引
   */
  private createIndexes(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chats_uuid ON chats(uuid);
      CREATE INDEX IF NOT EXISTS idx_chats_update_time ON chats(update_time DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_uuid ON messages(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_chat_id ON compressed_summaries(chat_id);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_chat_uuid ON compressed_summaries(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_status_chat ON compressed_summaries(status, chat_id);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_message_range ON compressed_summaries(chat_id, start_message_id, end_message_id);
    `)

    console.log('[DatabaseService] Indexes created')
  }

  /**
   * 准备常用 SQL 语句
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized')

    // Chat statements
    this.stmts.insertChat = this.db.prepare(`
      INSERT INTO chats (uuid, title, model, create_time, update_time)
      VALUES (?, ?, ?, ?, ?)
    `)

    this.stmts.getAllChats = this.db.prepare(`
      SELECT * FROM chats ORDER BY update_time DESC
    `)

    this.stmts.getChatById = this.db.prepare(`
      SELECT * FROM chats WHERE id = ?
    `)

    this.stmts.updateChat = this.db.prepare(`
      UPDATE chats SET uuid = ?, title = ?, model = ?, create_time = ?, update_time = ?
      WHERE id = ?
    `)

    this.stmts.deleteChat = this.db.prepare(`
      DELETE FROM chats WHERE id = ?
    `)

    // Message statements
    this.stmts.insertMessage = this.db.prepare(`
      INSERT INTO messages (chat_id, chat_uuid, body, tokens)
      VALUES (?, ?, ?, ?)
    `)

    this.stmts.getAllMessages = this.db.prepare(`
      SELECT * FROM messages
    `)

    this.stmts.getMessageById = this.db.prepare(`
      SELECT * FROM messages WHERE id = ?
    `)

    this.stmts.updateMessage = this.db.prepare(`
      UPDATE messages SET chat_id = ?, chat_uuid = ?, body = ?, tokens = ?
      WHERE id = ?
    `)

    this.stmts.deleteMessage = this.db.prepare(`
      DELETE FROM messages WHERE id = ?
    `)

    // Config statements
    this.stmts.getConfig = this.db.prepare(`
      SELECT * FROM configs WHERE key = ?
    `)

    this.stmts.upsertConfig = this.db.prepare(`
      INSERT INTO configs (key, value, version, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        version = excluded.version,
        updated_at = excluded.updated_at
    `)

    // CompressedSummary statements
    this.stmts.insertCompressedSummary = this.db.prepare(`
      INSERT INTO compressed_summaries (
        chat_id, chat_uuid, message_ids, start_message_id, end_message_id,
        summary, original_token_count, summary_token_count, compression_ratio,
        compressed_at, compression_model, compression_version, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmts.getCompressedSummariesByChatId = this.db.prepare(`
      SELECT * FROM compressed_summaries
      WHERE chat_id = ?
      ORDER BY start_message_id ASC
    `)

    this.stmts.getActiveCompressedSummariesByChatId = this.db.prepare(`
      SELECT * FROM compressed_summaries
      WHERE chat_id = ? AND status = 'active'
      ORDER BY start_message_id ASC
    `)

    this.stmts.updateCompressedSummaryStatus = this.db.prepare(`
      UPDATE compressed_summaries SET status = ? WHERE id = ?
    `)

    this.stmts.deleteCompressedSummary = this.db.prepare(`
      DELETE FROM compressed_summaries WHERE id = ?
    `)

    console.log('[DatabaseService] Statements prepared')
  }

  /**
   * 将数据库行转换为 ChatEntity
   */
  private rowToChatEntity(row: ChatRow): ChatEntity {
    return {
      id: row.id,
      uuid: row.uuid,
      title: row.title,
      messages: [], // 空数组，需要通过 getMessagesByChatId 获取
      msgCount: row.msg_count,
      model: row.model ?? undefined,
      createTime: row.create_time,
      updateTime: row.update_time,
    }
  }

  /**
   * 获取聊天的所有消息 ID
   */
  private getMessageIdsByChatId(chatId: number): number[] {
    if (!this.db) throw new Error('Database not initialized')

    const rows = this.db.prepare('SELECT id FROM messages WHERE chat_id = ? ORDER BY id ASC').all(chatId) as { id: number }[]
    return rows.map(row => row.id)
  }

  /**
   * 将数据库行转换为 MessageEntity
   */
  private rowToMessageEntity(row: MessageRow): MessageEntity {
    return {
      id: row.id,
      chatId: row.chat_id ?? undefined,
      chatUuid: row.chat_uuid ?? undefined,
      body: JSON.parse(row.body),
      tokens: row.tokens ?? undefined,
    }
  }

  // ==================== Chat 操作 ====================

  /**
   * 保存聊天
   */
  public saveChat(data: ChatEntity): number {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const result = this.stmts.insertChat!.run(
        data.uuid,
        data.title,
        data.model ?? null,
        data.createTime,
        data.updateTime
      )
      console.log(`[DatabaseService] Saved chat: ${result.lastInsertRowid}`)
      return result.lastInsertRowid as number
    } catch (error) {
      console.error('[DatabaseService] Failed to save chat:', error)
      throw error
    }
  }

  /**
   * 获取所有聊天（不包含消息列表）
   */
  public getAllChats(): ChatEntity[] {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const rows = this.stmts.getAllChats!.all() as ChatRow[]
      return rows.map(row => {
        const chat = this.rowToChatEntity(row)
        // 不填充 messages 字段，保持为空数组
        chat.messages = []
        return chat
      })
    } catch (error) {
      console.error('[DatabaseService] Failed to get all chats:', error)
      throw error
    }
  }

  /**
   * 根据 ID 获取聊天
   */
  public getChatById(id: number): ChatEntity | undefined {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const row = this.stmts.getChatById!.get(id) as ChatRow | undefined
      if (!row) return undefined

      const chat = this.rowToChatEntity(row)
      // 填充 messages 字段
      chat.messages = this.getMessageIdsByChatId(row.id)
      return chat
    } catch (error) {
      console.error('[DatabaseService] Failed to get chat by id:', error)
      throw error
    }
  }

  /**
   * 更新聊天
   */
  public updateChat(data: ChatEntity): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!data.id) throw new Error('Chat id is required for update')

    try {
      this.stmts.updateChat!.run(
        data.uuid,
        data.title,
        data.model ?? null,
        data.createTime,
        data.updateTime,
        data.id
      )
      console.log(`[DatabaseService] Updated chat: ${data.id}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to update chat:', error)
      throw error
    }
  }

  /**
   * 删除聊天
   */
  public deleteChat(id: number): void {
    if (!this.db) throw new Error('Database not initialized')

    try {
      this.stmts.deleteChat!.run(id)
      console.log(`[DatabaseService] Deleted chat: ${id}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to delete chat:', error)
      throw error
    }
  }

  // ==================== Message 操作 ====================

  /**
   * 保存消息
   */
  public saveMessage(data: MessageEntity): number {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const result = this.stmts.insertMessage!.run(
        data.chatId ?? null,
        data.chatUuid ?? null,
        JSON.stringify(data.body),
        data.tokens ?? null
      )

      // 如果消息关联了聊天，递增该聊天的 msg_count
      if (data.chatId) {
        this.db.prepare('UPDATE chats SET msg_count = msg_count + 1 WHERE id = ?').run(data.chatId)
      }

      console.log(`[DatabaseService] Saved message: ${result.lastInsertRowid}`)
      return result.lastInsertRowid as number
    } catch (error) {
      console.error('[DatabaseService] Failed to save message:', error)
      throw error
    }
  }

  /**
   * 获取所有消息
   */
  public getAllMessages(): MessageEntity[] {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const rows = this.stmts.getAllMessages!.all() as MessageRow[]
      return rows.map(row => this.rowToMessageEntity(row))
    } catch (error) {
      console.error('[DatabaseService] Failed to get all messages:', error)
      throw error
    }
  }

  /**
   * 根据 ID 获取消息
   */
  public getMessageById(id: number): MessageEntity | undefined {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const row = this.stmts.getMessageById!.get(id) as MessageRow | undefined
      return row ? this.rowToMessageEntity(row) : undefined
    } catch (error) {
      console.error('[DatabaseService] Failed to get message by id:', error)
      throw error
    }
  }

  /**
   * 根据多个 ID 获取消息（批量查询）
   */
  public getMessageByIds(ids: number[]): MessageEntity[] {
    if (!this.db) throw new Error('Database not initialized')
    if (ids.length === 0) return []

    try {
      const stmt = this.stmts.getMessageById!
      const transaction = this.db.transaction((ids: number[]) => {
        return ids.map(id => stmt.get(id)).filter(row => row !== undefined)
      })
      const rows = transaction(ids) as MessageRow[]
      return rows.map(row => this.rowToMessageEntity(row))
    } catch (error) {
      console.error('[DatabaseService] Failed to get messages by ids:', error)
      throw error
    }
  }

  /**
   * 更新消息
   */
  public updateMessage(data: MessageEntity): void {
    if (!this.db) throw new Error('Database not initialized')
    if (!data.id) throw new Error('Message id is required for update')

    try {
      this.stmts.updateMessage!.run(
        data.chatId ?? null,
        data.chatUuid ?? null,
        JSON.stringify(data.body),
        data.tokens ?? null,
        data.id
      )
      console.log(`[DatabaseService] Updated message: ${data.id}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to update message:', error)
      throw error
    }
  }

  /**
   * 删除消息
   */
  public deleteMessage(id: number): void {
    if (!this.db) throw new Error('Database not initialized')

    try {
      // 先获取消息的 chat_id，用于更新 msg_count
      const message = this.db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(id) as { chat_id: number | null } | undefined

      // 删除消息
      this.stmts.deleteMessage!.run(id)

      // 如果消息关联了聊天，递减该聊天的 msg_count
      if (message?.chat_id) {
        this.db.prepare('UPDATE chats SET msg_count = msg_count - 1 WHERE id = ?').run(message.chat_id)
      }

      console.log(`[DatabaseService] Deleted message: ${id}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to delete message:', error)
      throw error
    }
  }

  /**
   * 加载默认的 providers
   */
  private loadDefaultProviders(): IProvider[] {
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

      console.log('[DatabaseService] Project root:', projectRoot)
      console.log('[DatabaseService] Searching for providers.json in:')
      for (const filePath of possiblePaths) {
        console.log(`  - ${filePath} (exists: ${fs.existsSync(filePath)})`)
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf-8')
          console.log(`[DatabaseService] ✓ Loaded providers from: ${filePath}`)
          return JSON.parse(data) as IProvider[]
        }
      }

      console.warn('[DatabaseService] ⚠ providers.json not found in any path, using empty array')
      return []
    } catch (error) {
      console.error('[DatabaseService] Failed to load default providers:', error)
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
      const row = this.stmts.getConfig!.get('appConfig') as ConfigRow | undefined
      if (!row) return undefined

      const config = JSON.parse(row.value) as IAppConfig
      return config
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
      this.stmts.upsertConfig!.run(
        'appConfig',
        JSON.stringify(config),
        config.version ?? null,
        Date.now()
      )
      console.log('[DatabaseService] Saved config')
    } catch (error) {
      console.error('[DatabaseService] Failed to save config:', error)
      throw error
    }
  }

  /**
   * 初始化配置（首次使用或版本升级）
   */
  public initConfig(): IAppConfig {
    if (!this.db) throw new Error('Database not initialized')

    try {
      // 加载默认 providers
      const defaultProviders = this.loadDefaultProviders()
      console.log(`[DatabaseService] Loaded ${defaultProviders.length} default providers`)

      // 默认配置
      const defaultConfig: IAppConfig = {
        providers: defaultProviders,
        version: 1.9,
        tools: {
          maxWebSearchItems: 3
        },
        configForUpdate: {
          version: 1.9,
        }
      }

      let config = this.getConfig()
      console.log('[DatabaseService] Existing config:', config ? 'found' : 'not found')

      if (!config) {
        // 首次使用，使用默认配置
        console.log('[DatabaseService] First time use, saving default config with', defaultProviders.length, 'providers')
        this.saveConfig(defaultConfig)
        console.log('[DatabaseService] Initialized with default config, providers count:', defaultProviders.length)
        return defaultConfig
      }

      // 检查版本并升级
      console.log('[DatabaseService] Existing config version:', config.version, 'default version:', defaultConfig.version)
      console.log('[DatabaseService] Existing config providers count:', config.providers?.length || 0)
      if (defaultConfig.version! > config.version!) {
        const upgraded = {
          ...config,
          ...defaultConfig.configForUpdate,
          version: defaultConfig.version
        }
        this.saveConfig(upgraded)
        console.log(`[DatabaseService] Upgraded config from ${config.version} to ${defaultConfig.version}`)
        return upgraded
      }

      console.log('[DatabaseService] Returning existing config, providers count:', config.providers?.length || 0)
      return config
    } catch (error) {
      console.error('[DatabaseService] Failed to init config:', error)
      throw error
    }
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.isInitialized = false
      console.log('[DatabaseService] Database closed')
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

    try {
      const result = this.stmts.insertCompressedSummary!.run(
        data.chatId,
        data.chatUuid,
        JSON.stringify(data.messageIds),
        data.startMessageId,
        data.endMessageId,
        data.summary,
        data.originalTokenCount ?? null,
        data.summaryTokenCount ?? null,
        data.compressionRatio ?? null,
        data.compressedAt,
        data.compressionModel ?? null,
        data.compressionVersion ?? 1,
        data.status ?? 'active'
      )
      console.log(`[DatabaseService] Saved compressed summary: ${result.lastInsertRowid}`)
      return result.lastInsertRowid as number
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

    try {
      const rows = this.stmts.getCompressedSummariesByChatId!.all(chatId) as CompressedSummaryRow[]
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

    try {
      const rows = this.stmts.getActiveCompressedSummariesByChatId!.all(chatId) as CompressedSummaryRow[]
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

    try {
      this.stmts.updateCompressedSummaryStatus!.run(status, id)
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

    try {
      this.stmts.deleteCompressedSummary!.run(id)
      console.log(`[DatabaseService] Deleted compressed summary: ${id}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to delete compressed summary:', error)
      throw error
    }
  }
}

// 导出单例实例
export default DatabaseService.getInstance()
