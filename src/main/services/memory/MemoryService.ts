/**
 * MemoryService - 对话记忆与上下文检索服务
 * 基于向量相似度实现长期记忆和上下文检索
 * 使用 SQLite 持久化存储，在主进程中运行
 * 使用 sqlite-vec 扩展进行高效向量搜索
 */

import EmbeddingServiceInstance, { EmbeddingService } from '../embedding/EmbeddingService'
import { app } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

/**
 * 记忆条目接口
 */
interface MemoryEntry {
  id: string // 唯一标识符
  chatId: number // 所属聊天 ID
  messageId: number // 消息 ID
  role: 'user' | 'assistant' | 'system' // 角色
  context_origin: string // 原始语言内容
  context_en: string // 英文内容（用于 embedding）
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
  context_origin: string
  context_en: string
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

      // 加载 sqlite-vec 扩展
      sqliteVec.load(this.db)
      console.log('[MemoryService] sqlite-vec extension loaded')
      const { vec_version } = this.db
        .prepare("select vec_version() as vec_version;")
        .get();
      console.log(`vec_version=${vec_version}`);

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
      const vecCount = this.db.prepare('SELECT count(*) as count FROM vec_memories').get() as { count: number }
      console.log(`[MemoryService] Initialized with ${vecCount.count} vec_memories`)
    } catch (error) {
      console.error('[MemoryService] Failed to initialize:', error)
      throw error
    }
  }
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized')

    // 创建 memories 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        context_origin TEXT NOT NULL,
        context_en TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      )
    `)

    // 创建 sqlite-vec 虚拟表用于向量搜索
    // 使用 vec0 虚拟表，384 维向量（all-MiniLM-L6-v2）
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding FLOAT[384]
      )
    `)

    console.log('[MemoryService] Tables created (with vec0 virtual table)')
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
      INSERT INTO memories (id, chat_id, message_id, role, context_origin, context_en, timestamp, metadata)
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
   * 从 vec_memories 表获取 embedding
   */
  private rowToEntry(row: MemoryRow): MemoryEntry {
    // 从 vec_memories 表获取 embedding
    const vecRow = this.db!.prepare(`
      SELECT embedding FROM vec_memories WHERE memory_id = ?
    `).get(row.id) as { embedding: Buffer } | undefined

    // 将 Buffer 转换为 Float32Array，然后转为普通数组
    let embedding: number[] = []
    if (vecRow && vecRow.embedding) {
      const float32Array = new Float32Array(
        vecRow.embedding.buffer,
        vecRow.embedding.byteOffset,
        vecRow.embedding.byteLength / 4
      )
      embedding = Array.from(float32Array)
    }

    return {
      id: row.id,
      chatId: row.chat_id,
      messageId: row.message_id,
      role: row.role as 'user' | 'assistant' | 'system',
      context_origin: row.context_origin,
      context_en: row.context_en,
      embedding,
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
      // 生成 embedding（使用 context_en）
      const { embedding } = await EmbeddingServiceInstance.generateEmbedding(entry.context_en)

      // 生成唯一 ID
      const id = `${entry.chatId}_${entry.messageId}_${Date.now()}`

      // 创建完整记忆条目
      const memoryEntry: MemoryEntry = {
        ...entry,
        id,
        embedding,
      }

      // 使用事务同时插入 memories 表和 vec_memories 表
      const insertTransaction = this.db!.transaction(() => {
        // 插入 memories 表
        this.stmts.insert!.run(
          id,
          entry.chatId,
          entry.messageId,
          entry.role,
          entry.context_origin,
          entry.context_en,
          entry.timestamp,
          entry.metadata ? JSON.stringify(entry.metadata) : null
        )

        // 插入 vec_memories 表（向量表）
        // 将 embedding 转换为 Buffer（sqlite-vec 需要 Blob 格式）
        const vecStmt = this.db!.prepare(`
          INSERT INTO vec_memories(memory_id, embedding) VALUES (?, ?)
        `)
        const embeddingVector = new Float32Array(embedding)
        // 从底层 ArrayBuffer 创建 Buffer，保持 Float32 的二进制格式
        const embeddingBuffer = Buffer.from(
          embeddingVector.buffer,
          embeddingVector.byteOffset,
          embeddingVector.byteLength
        )
        vecStmt.run(id, embeddingBuffer)
      })

      insertTransaction()

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
      // 批量生成 embeddings（使用 context_en）
      const texts = entries.map(e => e.context_en)
      const { embeddings } = await EmbeddingServiceInstance.generateBatchEmbeddings(texts)

      // 开始事务 - 同时插入 memories 和 vec_memories 表
      const insertMany = this.db!.transaction((memoryEntries: MemoryEntry[]) => {
        const vecStmt = this.db!.prepare(`
          INSERT INTO vec_memories(memory_id, embedding) VALUES (?, ?)
        `)

        for (const entry of memoryEntries) {
          // 插入 memories 表
          this.stmts.insert!.run(
            entry.id,
            entry.chatId,
            entry.messageId,
            entry.role,
            entry.context_origin,
            entry.context_en,
            entry.timestamp,
            entry.metadata ? JSON.stringify(entry.metadata) : null
          )

          // 插入 vec_memories 表（转换为 Buffer）
          const embeddingVector = new Float32Array(entry.embedding)
          // 从底层 ArrayBuffer 创建 Buffer，保持 Float32 的二进制格式
          const embeddingBuffer = Buffer.from(
            embeddingVector.buffer,
            embeddingVector.byteOffset,
            embeddingVector.byteLength
          )
          vecStmt.run(entry.id, embeddingBuffer)
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
   * 使用 sqlite-vec 进行高效向量搜索
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
      // 将 embedding 转换为 Buffer（sqlite-vec 需要 Blob 格式）
      const queryVector = new Float32Array(queryEmbedding)
      // 从底层 ArrayBuffer 创建 Buffer，保持 Float32 的二进制格式
      const queryBuffer = Buffer.from(
        queryVector.buffer,
        queryVector.byteOffset,
        queryVector.byteLength
      )

      const whereConditions: string[] = []
      const params: any[] = []

      if (chatId !== undefined) {
        whereConditions.push('m.chat_id = ?')
        params.push(chatId)
      }

      if (excludeIds.length > 0) {
        whereConditions.push(`m.id NOT IN (${excludeIds.map(() => '?').join(',')})`)
        params.push(...excludeIds)
      }

      if (timeRange?.start) {
        whereConditions.push('m.timestamp >= ?')
        params.push(timeRange.start)
      }

      if (timeRange?.end) {
        whereConditions.push('m.timestamp <= ?')
        params.push(timeRange.end)
      }

      // 构建完整的 SQL 查询
      // 使用 vec_distance_cosine 函数进行向量搜索
      // 这种方法比 MATCH 操作符更灵活，可以自由添加其他过滤条件
      const additionalConditions = whereConditions.length > 0
        ? ' AND ' + whereConditions.join(' AND ')
        : ''

      const sql = `
        SELECT
          m.*,
          vec_distance_cosine(v.embedding, ?) as distance
        FROM vec_memories v
        INNER JOIN memories m ON v.memory_id = m.id
        WHERE 1=1${additionalConditions}
        ORDER BY distance ASC
        LIMIT ?
      `

      // 添加参数：查询向量 + 过滤条件参数 + topK
      const finalParams = [queryBuffer, ...params, topK]

      // 执行查询
      const stmt = this.db!.prepare(sql)
      const rows = stmt.all(...finalParams) as Array<MemoryRow & { distance: number }>

      // 构建结果，将 distance 转换为 similarity
      // 暂时移除阈值过滤，返回所有结果
      const results: SearchResult[] = rows.map((row, index) => ({
        entry: this.rowToEntry(row),
        similarity: 1 - row.distance,  // distance 转换为 similarity
        rank: index + 1
      }))

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
   * 删除记忆条目（同时删除向量表）
   */
  public async deleteMemory(id: string): Promise<boolean> {
    await this.initialize()

    try {
      // 使用事务同时删除两个表
      const deleteTransaction = this.db!.transaction(() => {
        this.stmts.deleteById!.run(id)
        this.db!.prepare('DELETE FROM vec_memories WHERE memory_id = ?').run(id)
      })

      deleteTransaction()
      console.log(`[MemoryService] Deleted memory: ${id}`)
      return true
    } catch (error) {
      console.error('[MemoryService] Failed to delete memory:', error)
      throw error
    }
  }

  /**
   * 删除聊天的所有记忆（同时删除向量表）
   */
  public async deleteChatMemories(chatId: number): Promise<number> {
    await this.initialize()

    try {
      // 先获取要删除的记忆 ID 列表
      const rows = this.stmts.getByChatId!.all(chatId) as MemoryRow[]
      const ids = rows.map(row => row.id)

      if (ids.length === 0) {
        return 0
      }

      // 使用事务同时删除两个表
      const deleteTransaction = this.db!.transaction(() => {
        this.stmts.deleteByChatId!.run(chatId)

        // 批量删除 vec_memories
        const placeholders = ids.map(() => '?').join(',')
        this.db!.prepare(`DELETE FROM vec_memories WHERE memory_id IN (${placeholders})`).run(...ids)
      })

      deleteTransaction()
      console.log(`[MemoryService] Deleted ${ids.length} memories for chat ${chatId}`)
      return ids.length
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
   * 清空所有记忆（同时清空向量表）
   */
  public async clear(): Promise<void> {
    await this.initialize()

    try {
      // 使用事务同时清空两个表
      const clearTransaction = this.db!.transaction(() => {
        this.db!.prepare('DELETE FROM memories').run()
        this.db!.prepare('DELETE FROM vec_memories').run()
      })

      clearTransaction()

      // 使用 VACUUM 回收空间
      this.db!.prepare('VACUUM').run()
      console.log('[MemoryService] Cleared all memories and vectors')
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
