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
  workspace_path: string | null
  create_time: number
  update_time: number
}

/**
 * 数据库行接口 - ChatSkill
 */
interface ChatSkillRow {
  chat_id: number
  skill_name: string
  load_order: number
  loaded_at: number
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
 * 数据库行接口 - Assistant
 */
interface AssistantRow {
  id: string
  name: string
  icon: string | null
  description: string | null
  model_account_id: string
  model_model_id: string
  system_prompt: string
  created_at: number
  updated_at: number
  is_built_in: number  // 0 or 1
  is_default: number   // 0 or 1
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
    getChatByUuid?: Database.Statement
    getWorkspacePathByUuid?: Database.Statement
    updateChat?: Database.Statement
    deleteChat?: Database.Statement
    // Chat skills statements
    insertChatSkill?: Database.Statement
    deleteChatSkill?: Database.Statement
    getChatSkillsByChatId?: Database.Statement
    getChatSkillMaxOrder?: Database.Statement

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

    // ChatSubmitEventTrace statements
    insertChatSubmitEvent?: Database.Statement

    // Assistant statements
    insertAssistant?: Database.Statement
    getAllAssistants?: Database.Statement
    getAssistantById?: Database.Statement
    updateAssistant?: Database.Statement
    deleteAssistant?: Database.Statement
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

      // 迁移旧表结构
      this.ensureChatWorkspacePathColumn()

      // 创建索引
      this.createIndexes()

      // 准备常用语句
      this.prepareStatements()

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
        workspace_path TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `)

    // 创建 chat_skills 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        skill_name TEXT NOT NULL,
        load_order INTEGER NOT NULL,
        loaded_at INTEGER NOT NULL
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

    // 创建 chat_submit_events 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_submit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id TEXT NOT NULL,
        chat_id INTEGER,
        chat_uuid TEXT,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload TEXT,
        meta TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)

    // 创建 assistants 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assistants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        description TEXT,
        model_account_id TEXT NOT NULL,
        model_model_id TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_built_in INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0
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
      CREATE INDEX IF NOT EXISTS idx_chat_submit_events_submission ON chat_submit_events(submission_id);
      CREATE INDEX IF NOT EXISTS idx_chat_submit_events_chat_id ON chat_submit_events(chat_id);
      CREATE INDEX IF NOT EXISTS idx_chat_submit_events_chat_uuid ON chat_submit_events(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_chat_submit_events_timestamp ON chat_submit_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_assistants_is_built_in ON assistants(is_built_in);
      CREATE INDEX IF NOT EXISTS idx_assistants_is_default ON assistants(is_default);
      CREATE INDEX IF NOT EXISTS idx_chat_skills_chat_id ON chat_skills(chat_id);
      CREATE INDEX IF NOT EXISTS idx_chat_skills_skill_name ON chat_skills(skill_name);
    `)

    console.log('[DatabaseService] Indexes created')
  }

  /**
   * 兼容旧数据库：为 chats 表补齐 workspace_path 字段
   */
  private ensureChatWorkspacePathColumn(): void {
    if (!this.db) throw new Error('Database not initialized')

    const columns = this.db.prepare(`PRAGMA table_info(chats)`).all() as { name: string }[]
    const hasWorkspacePath = columns.some(column => column.name === 'workspace_path')

    if (!hasWorkspacePath) {
      this.db.exec(`ALTER TABLE chats ADD COLUMN workspace_path TEXT`)
      console.log('[DatabaseService] Migrated chats table: added workspace_path')
    }
  }

  /**
   * 准备常用 SQL 语句
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized')

    // Chat statements
    this.stmts.insertChat = this.db.prepare(`
      INSERT INTO chats (uuid, title, model, workspace_path, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    this.stmts.getAllChats = this.db.prepare(`
      SELECT * FROM chats ORDER BY update_time DESC
    `)

    this.stmts.getChatById = this.db.prepare(`
      SELECT * FROM chats WHERE id = ?
    `)

    this.stmts.getChatByUuid = this.db.prepare(`
      SELECT * FROM chats WHERE uuid = ?
    `)

    this.stmts.getWorkspacePathByUuid = this.db.prepare(`
      SELECT workspace_path FROM chats WHERE uuid = ?
    `)

    this.stmts.updateChat = this.db.prepare(`
      UPDATE chats SET uuid = ?, title = ?, model = ?, workspace_path = ?, create_time = ?, update_time = ?
      WHERE id = ?
    `)

    this.stmts.deleteChat = this.db.prepare(`
      DELETE FROM chats WHERE id = ?
    `)

    // Chat skills statements
    this.stmts.insertChatSkill = this.db.prepare(`
      INSERT INTO chat_skills (chat_id, skill_name, load_order, loaded_at)
      VALUES (?, ?, ?, ?)
    `)

    this.stmts.deleteChatSkill = this.db.prepare(`
      DELETE FROM chat_skills WHERE chat_id = ? AND skill_name = ?
    `)

    this.stmts.getChatSkillsByChatId = this.db.prepare(`
      SELECT * FROM chat_skills WHERE chat_id = ? ORDER BY load_order ASC
    `)

    this.stmts.getChatSkillMaxOrder = this.db.prepare(`
      SELECT MAX(load_order) as max_order FROM chat_skills WHERE chat_id = ?
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

    // ChatSubmitEventTrace statements
    this.stmts.insertChatSubmitEvent = this.db.prepare(`
      INSERT INTO chat_submit_events (
        submission_id, chat_id, chat_uuid, sequence, type, timestamp, payload, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Assistant statements
    this.stmts.insertAssistant = this.db.prepare(`
      INSERT INTO assistants (
        id, name, icon, description, model_account_id, model_model_id,
        system_prompt, created_at, updated_at, is_built_in, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmts.getAllAssistants = this.db.prepare(`
      SELECT * FROM assistants ORDER BY created_at DESC
    `)

    this.stmts.getAssistantById = this.db.prepare(`
      SELECT * FROM assistants WHERE id = ?
    `)

    this.stmts.updateAssistant = this.db.prepare(`
      UPDATE assistants SET
        name = ?, icon = ?, description = ?, model_account_id = ?,
        model_model_id = ?, system_prompt = ?, updated_at = ?,
        is_built_in = ?, is_default = ?
      WHERE id = ?
    `)

    this.stmts.deleteAssistant = this.db.prepare(`
      DELETE FROM assistants WHERE id = ?
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
      workspacePath: row.workspace_path ?? undefined,
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
        data.workspacePath ?? null,
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
   * 根据 UUID 获取聊天
   */
  public getChatByUuid(uuid: string): ChatEntity | undefined {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const row = this.stmts.getChatByUuid!.get(uuid) as ChatRow | undefined
      if (!row) return undefined

      const chat = this.rowToChatEntity(row)
      // 填充 messages 字段
      chat.messages = this.getMessageIdsByChatId(row.id)
      return chat
    } catch (error) {
      console.error('[DatabaseService] Failed to get chat by uuid:', error)
      throw error
    }
  }

  /**
   * 根据 UUID 获取 workspace_path
   */
  public getWorkspacePathByUuid(uuid: string): string | undefined {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const row = this.stmts.getWorkspacePathByUuid!.get(uuid) as { workspace_path: string | null } | undefined
      return row?.workspace_path ?? undefined
    } catch (error) {
      console.error('[DatabaseService] Failed to get workspace path by uuid:', error)
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
        data.workspacePath ?? null,
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

  /**
   * 获取聊天已加载的技能列表（按加载顺序）
   */
  public getChatSkills(chatId: number): string[] {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const rows = this.stmts.getChatSkillsByChatId!.all(chatId) as ChatSkillRow[]
      return rows.map(row => row.skill_name)
    } catch (error) {
      console.error('[DatabaseService] Failed to get chat skills:', error)
      throw error
    }
  }

  /**
   * 添加聊天技能（后加载优先）
   */
  public addChatSkill(chatId: number, skillName: string): void {
    if (!this.db) throw new Error('Database not initialized')

    try {
      this.stmts.deleteChatSkill!.run(chatId, skillName)
      const row = this.stmts.getChatSkillMaxOrder!.get(chatId) as { max_order: number | null } | undefined
      const maxOrder = row?.max_order ?? 0
      this.stmts.insertChatSkill!.run(chatId, skillName, maxOrder + 1, Date.now())
    } catch (error) {
      console.error('[DatabaseService] Failed to add chat skill:', error)
      throw error
    }
  }

  /**
   * 移除聊天技能
   */
  public removeChatSkill(chatId: number, skillName: string): void {
    if (!this.db) throw new Error('Database not initialized')

    try {
      this.stmts.deleteChatSkill!.run(chatId, skillName)
    } catch (error) {
      console.error('[DatabaseService] Failed to remove chat skill:', error)
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

      console.log('[DatabaseService] Project root:', projectRoot)
      console.log('[DatabaseService] Searching for providers.json in:')
      for (const filePath of possiblePaths) {
        console.log(`  - ${filePath} (exists: ${fs.existsSync(filePath)})`)
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf-8')
          console.log(`[DatabaseService] ✓ Loaded provider definitions from: ${filePath}`)
          return JSON.parse(data) as ProviderDefinition[]
        }
      }

      console.warn('[DatabaseService] ⚠ providers.json not found in any path, using empty array')
      return []
    } catch (error) {
      console.error('[DatabaseService] Failed to load provider definitions:', error)
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
      const row = this.stmts.getConfig!.get(key) as ConfigRow | undefined
      if (!row) return undefined
      return row.value
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
      this.stmts.upsertConfig!.run(
        key,
        value,
        version ?? null,
        Date.now()
      )
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
        providerDefinitions: defaultProviderList,
        accounts: [],
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
        console.log('[DatabaseService] Initialized with default config, providerDefinitions count:', defaultProviderList.length)
        return defaultConfig
      }

      const normalizedDefinitions = this.normalizeProviderDefinitions(config.providerDefinitions || [])
      const normalizedAccounts = this.normalizeAccounts(config.accounts || [])

      let nextConfig = {
        ...config,
        providerDefinitions: normalizedDefinitions.definitions,
        accounts: normalizedAccounts.accounts
      }
      let shouldSave = normalizedDefinitions.changed || normalizedAccounts.changed

      console.log('[DatabaseService] Existing config version:', config.version, 'default version:', defaultConfig.version)
      console.log('[DatabaseService] Existing config providerDefinitions count:', config.providerDefinitions?.length || 0)

      const currentDefinitions = nextConfig.providerDefinitions || []
      if (currentDefinitions.length === 0) {
        nextConfig = {
          ...nextConfig,
          providerDefinitions: defaultProviderList
        }
        shouldSave = true
        console.log('[DatabaseService] Backfilled providerDefinitions from defaults')
      }

      if (defaultConfig.version! > config.version!) {
        nextConfig = {
          ...nextConfig,
          ...defaultConfig.configForUpdate,
          version: defaultConfig.version
        }
        shouldSave = true
        console.log(`[DatabaseService] Upgraded config from ${config.version} to ${defaultConfig.version}`)
      }

      if (shouldSave) {
        this.saveConfig(nextConfig)
        return nextConfig
      }

      console.log('[DatabaseService] Returning existing config, providerDefinitions count:', nextConfig.providerDefinitions?.length || 0)
      return nextConfig
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

  private normalizeAccounts(
    accounts: ProviderAccount[]
  ): { accounts: ProviderAccount[]; changed: boolean } {
    let changed = false
    const normalized = accounts.map(account => {
      const normalizedProviderId = this.normalizeProviderId(account.providerId || '')
      if (!normalizedProviderId) {
        return account
      }
      if (normalizedProviderId !== account.providerId) {
        changed = true
        return { ...account, providerId: normalizedProviderId }
      }
      return account
    })
    const deduped: ProviderAccount[] = []
    const seen = new Set<string>()
    normalized.forEach(account => {
      if (seen.has(account.providerId)) {
        changed = true
        return
      }
      seen.add(account.providerId)
      deduped.push(account)
    })

    return { accounts: deduped, changed }
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

  // ==================== ChatSubmitEventTrace Methods ====================

  /**
   * 保存 chat submit 事件轨迹
   */
  public saveChatSubmitEvent(data: ChatSubmitEventTrace): number {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const result = this.stmts.insertChatSubmitEvent!.run(
        data.submissionId,
        data.chatId ?? null,
        data.chatUuid ?? null,
        data.sequence,
        data.type,
        data.timestamp,
        data.payload ? JSON.stringify(data.payload) : null,
        data.meta ? JSON.stringify(data.meta) : null
      )
      return result.lastInsertRowid as number
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

    try {
      this.stmts.insertAssistant!.run(
        assistant.id,
        assistant.name,
        assistant.icon || null,
        assistant.description || null,
        assistant.modelRef.accountId,
        assistant.modelRef.modelId,
        assistant.systemPrompt,
        assistant.createdAt,
        assistant.updatedAt,
        assistant.isBuiltIn ? 1 : 0,
        assistant.isDefault ? 1 : 0
      )
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

    try {
      const rows = this.stmts.getAllAssistants!.all() as AssistantRow[]
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

    try {
      this.db.prepare('DELETE FROM assistants').run()
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

    try {
      const row = this.stmts.getAssistantById!.get(id) as AssistantRow | undefined
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

    try {
      this.stmts.updateAssistant!.run(
        assistant.name,
        assistant.icon || null,
        assistant.description || null,
        assistant.modelRef.accountId,
        assistant.modelRef.modelId,
        assistant.systemPrompt,
        assistant.updatedAt,
        assistant.isBuiltIn ? 1 : 0,
        assistant.isDefault ? 1 : 0,
        assistant.id
      )
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

    try {
      this.stmts.deleteAssistant!.run(id)
      console.log(`[DatabaseService] Deleted assistant: ${id}`)
    } catch (error) {
      console.error('[DatabaseService] Failed to delete assistant:', error)
      throw error
    }
  }
}

// 导出单例实例
export default DatabaseService.getInstance()
