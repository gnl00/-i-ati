/**
 * MemoryService - 对话记忆与上下文检索服务
 * 基于向量相似度实现长期记忆和上下文检索
 * 使用 SQLite 持久化存储，在主进程中运行
 */

import EmbeddingServiceInstance, { EmbeddingService } from './embedding/EmbeddingService'
import { app } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'

/**
 * 记忆条目接口
 */
interface MemoryEntry {
  id: string // 唯一标识符
  chatId: number // 所属聊天 ID
  messageId: number // 消息 ID
  role: 'user' | 'assistant' | 'system' // 角色
  content: string // 文本内容
  embedding: number[] // 向量表示
  timestamp: number // 时间戳
  metadata?: Record<string, any> // 额外元数据
}

/**
 * 搜索结果接口
 */
interface SearchResult {
  entry: MemoryEntry
  similarity: number // 相似度分数 [0, 1]
  rank: number // 排名
}

/**
 * 搜索选项接口
 */
interface SearchOptions {
  chatId?: number // 限定聊天 ID
  topK?: number // 返回前 K 个结果
  threshold?: number // 相似度阈值
  excludeIds?: string[] // 排除的记忆 ID
  timeRange?: {
    start?: number
    end?: number
  }
}

/**
 * 数据库行接口
 */
interface MemoryRow {
  id: string
  chat_id: number
  message_id: number
  role: string
  content: string
  embedding: string // JSON string
  timestamp: number
  metadata: string | null // JSON string
}

/**
 * SQLite 向量存储服务
 */
class MemoryService {
  private static instance: MemoryService
  private db: Database.Database | null = null
  private dbPath: string
  private isInitialized: boolean = false

  // 预编译语句缓存
  private stmts: {
    insert?: Database.Statement
    getById?: Database.Statement
    getByChatId?: Database.Statement
    deleteById?: Database.Statement
    deleteByChatId?: Database.Statement
    count?: Database.Statement
    countByChat?: Database.Statement
  } = {}

  private constructor() {
    // 数据库存储路径
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'memories.db')
    console.log('[MemoryService] Database path:', this.dbPath)
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService()
    }
    return MemoryService.instance
  }

  /**
   * 初始化服务和数据库
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      console.log('[MemoryService] Initializing memory service...')

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

      const count = this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number }
      console.log(`[MemoryService] Initialized with ${count.count} memories`)
    } catch (error) {
      console.error('[MemoryService] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * 创建数据库表
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized')

    // 创建 memories 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      )
    `)

    console.log('[MemoryService] Tables created')
  }

  /**
   * 创建索引
   */
  private createIndexes(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chat_id ON memories(chat_id);
      CREATE INDEX IF NOT EXISTS idx_message_id ON memories(message_id);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_role ON memories(role);
    `)

    console.log('[MemoryService] Indexes created')
  }

  /**
   * 准备常用 SQL 语句
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.stmts.insert = this.db.prepare(`
      INSERT INTO memories (id, chat_id, message_id, role, content, embedding, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.stmts.getById = this.db.prepare(`
      SELECT * FROM memories WHERE id = ?
    `)

    this.stmts.getByChatId = this.db.prepare(`
      SELECT * FROM memories WHERE chat_id = ? ORDER BY timestamp ASC
    `)

    this.stmts.deleteById = this.db.prepare(`
      DELETE FROM memories WHERE id = ?
    `)

    this.stmts.deleteByChatId = this.db.prepare(`
      DELETE FROM memories WHERE chat_id = ?
    `)

    this.stmts.count = this.db.prepare(`
      SELECT COUNT(*) as count FROM memories
    `)

    this.stmts.countByChat = this.db.prepare(`
      SELECT chat_id, COUNT(*) as count FROM memories GROUP BY chat_id
    `)

    console.log('[MemoryService] Statements prepared')
  }

  /**
   * 将数据库行转换为 MemoryEntry
   */
  private rowToEntry(row: MemoryRow): MemoryEntry {
    return {
      id: row.id,
      chatId: row.chat_id,
      messageId: row.message_id,
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content,
      embedding: JSON.parse(row.embedding),
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }
  }

  /**
   * 添加记忆条目
   * @param entry 记忆条目（不含 embedding）
   * @returns 保存的记忆条目（含 embedding）
   */
  public async addMemory(
    entry: Omit<MemoryEntry, 'embedding' | 'id'>
  ): Promise<MemoryEntry> {
    await this.initialize()

    try {
      // 生成 embedding
      const { embedding } = await EmbeddingServiceInstance.generateEmbedding(entry.content)

      // 生成唯一 ID
      const id = `${entry.chatId}_${entry.messageId}_${Date.now()}`

      // 创建完整记忆条目
      const memoryEntry: MemoryEntry = {
        ...entry,
        id,
        embedding,
      }

      // 插入数据库
      this.stmts.insert!.run(
        id,
        entry.chatId,
        entry.messageId,
        entry.role,
        entry.content,
        JSON.stringify(embedding),
        entry.timestamp,
        entry.metadata ? JSON.stringify(entry.metadata) : null
      )

      console.log(`[MemoryService] Added memory: ${id}`)
      return memoryEntry
    } catch (error) {
      console.error('[MemoryService] Failed to add memory:', error)
      throw error
    }
  }

  /**
   * 批量添加记忆条目
   */
  public async addBatchMemories(
    entries: Omit<MemoryEntry, 'embedding' | 'id'>[]
  ): Promise<MemoryEntry[]> {
    await this.initialize()

    if (entries.length === 0) {
      return []
    }

    try {
      // 批量生成 embeddings
      const texts = entries.map(e => e.content)
      const { embeddings } = await EmbeddingServiceInstance.generateBatchEmbeddings(texts)

      // 开始事务
      const insertMany = this.db!.transaction((memoryEntries: MemoryEntry[]) => {
        for (const entry of memoryEntries) {
          this.stmts.insert!.run(
            entry.id,
            entry.chatId,
            entry.messageId,
            entry.role,
            entry.content,
            JSON.stringify(entry.embedding),
            entry.timestamp,
            entry.metadata ? JSON.stringify(entry.metadata) : null
          )
        }
      })

      // 创建记忆条目
      const memoryEntries: MemoryEntry[] = entries.map((entry, index) => {
        const id = `${entry.chatId}_${entry.messageId}_${Date.now()}_${index}`
        return {
          ...entry,
          id,
          embedding: embeddings[index],
        }
      })

      // 批量插入
      insertMany(memoryEntries)

      console.log(`[MemoryService] Added ${memoryEntries.length} memories in batch`)
      return memoryEntries
    } catch (error) {
      console.error('[MemoryService] Failed to add batch memories:', error)
      throw error
    }
  }

  /**
   * 计算余弦相似度（纯 SQL 实现）
   * 注意：这是一个辅助方法，实际搜索在应用层计算
   */
  private cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    return EmbeddingService.cosineSimilarity(embedding1, embedding2)
  }

  /**
   * 基于查询文本搜索相关记忆
   * @param query 查询文本
   * @param options 搜索选项
   * @returns 搜索结果数组
   */
  public async searchMemories(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    await this.initialize()

    const {
      chatId,
      topK = 5,
      threshold = 0.5,
      excludeIds = [],
      timeRange,
    } = options

    try {
      // 生成查询的 embedding
      const { embedding: queryEmbedding } = await EmbeddingServiceInstance.generateEmbedding(query)

      // 构建基础查询
      let sql = 'SELECT * FROM memories WHERE 1=1'
      const params: any[] = []

      // 添加过滤条件
      if (chatId !== undefined) {
        sql += ' AND chat_id = ?'
        params.push(chatId)
      }

      if (excludeIds.length > 0) {
        sql += ` AND id NOT IN (${excludeIds.map(() => '?').join(',')})`
        params.push(...excludeIds)
      }

      if (timeRange?.start) {
        sql += ' AND timestamp >= ?'
        params.push(timeRange.start)
      }

      if (timeRange?.end) {
        sql += ' AND timestamp <= ?'
        params.push(timeRange.end)
      }

      // 执行查询
      const stmt = this.db!.prepare(sql)
      const rows = stmt.all(...params) as MemoryRow[]

      // 计算相似度并排序
      const results: SearchResult[] = rows
        .map((row) => {
          const entry = this.rowToEntry(row)
          const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding)
          return {
            entry,
            similarity,
            rank: 0, // 临时值
          }
        })
        .filter(r => r.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK)
        .map((r, index) => ({ ...r, rank: index + 1 }))

      console.log(`[MemoryService] Found ${results.length} relevant memories for query`)
      return results
    } catch (error) {
      console.error('[MemoryService] Failed to search memories:', error)
      throw error
    }
  }

  /**
   * 获取聊天的所有记忆
   */
  public async getChatMemories(chatId: number): Promise<MemoryEntry[]> {
    await this.initialize()

    try {
      const rows = this.stmts.getByChatId!.all(chatId) as MemoryRow[]
      return rows.map(row => this.rowToEntry(row))
    } catch (error) {
      console.error('[MemoryService] Failed to get chat memories:', error)
      throw error
    }
  }

  /**
   * 根据 ID 获取记忆
   */
  public async getMemoryById(id: string): Promise<MemoryEntry | null> {
    await this.initialize()

    try {
      const row = this.stmts.getById!.get(id) as MemoryRow | undefined
      return row ? this.rowToEntry(row) : null
    } catch (error) {
      console.error('[MemoryService] Failed to get memory:', error)
      throw error
    }
  }

  /**
   * 删除记忆条目
   */
  public async deleteMemory(id: string): Promise<boolean> {
    await this.initialize()

    try {
      const result = this.stmts.deleteById!.run(id)
      const deleted = result.changes > 0
      if (deleted) {
        console.log(`[MemoryService] Deleted memory: ${id}`)
      }
      return deleted
    } catch (error) {
      console.error('[MemoryService] Failed to delete memory:', error)
      throw error
    }
  }

  /**
   * 删除聊天的所有记忆
   */
  public async deleteChatMemories(chatId: number): Promise<number> {
    await this.initialize()

    try {
      const result = this.stmts.deleteByChatId!.run(chatId)
      const count = result.changes
      console.log(`[MemoryService] Deleted ${count} memories for chat ${chatId}`)
      return count
    } catch (error) {
      console.error('[MemoryService] Failed to delete chat memories:', error)
      throw error
    }
  }

  /**
   * 获取统计信息
   */
  public getStats() {
    if (!this.db) {
      return {
        totalMemories: 0,
        totalChats: 0,
        memoriesByChat: [],
      }
    }

    try {
      const totalResult = this.stmts.count!.get() as { count: number }
      const chatResults = this.stmts.countByChat!.all() as { chat_id: number; count: number }[]

      return {
        totalMemories: totalResult.count,
        totalChats: chatResults.length,
        memoriesByChat: chatResults.map(r => ({
          chatId: r.chat_id,
          count: r.count,
        })),
      }
    } catch (error) {
      console.error('[MemoryService] Failed to get stats:', error)
      return {
        totalMemories: 0,
        totalChats: 0,
        memoriesByChat: [],
      }
    }
  }

  /**
   * 清空所有记忆
   */
  public async clear(): Promise<void> {
    await this.initialize()

    try {
      this.db!.prepare('DELETE FROM memories').run()
      // 使用 VACUUM 回收空间
      this.db!.prepare('VACUUM').run()
      console.log('[MemoryService] Cleared all memories')
    } catch (error) {
      console.error('[MemoryService] Failed to clear memories:', error)
      throw error
    }
  }

  /**
   * 优化数据库
   */
  public async optimize(): Promise<void> {
    await this.initialize()

    try {
      // 分析表以优化查询计划
      this.db!.prepare('ANALYZE').run()
      console.log('[MemoryService] Database optimized')
    } catch (error) {
      console.error('[MemoryService] Failed to optimize database:', error)
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
      console.log('[MemoryService] Database closed')
    }
  }
}

// 导出单例实例
export default MemoryService.getInstance()
