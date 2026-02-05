import MemoryService from '@main/services/memory/MemoryService'
import type { MemoryRetrievalResponse, MemorySaveResponse, MemoryUpdateResponse } from '@tools/memory/index.d'

interface MemoryRetrievalArgs {
  query: string
  chatId?: number
  topK?: number
  threshold?: number
}

interface MemorySaveArgs {
  context_origin: string
  context_en: string
  chatId: number
  metadata?: {
    category?: string
    importance?: 'low' | 'medium' | 'high'
    tags?: string[]
  }
}

interface MemoryUpdateArgs {
  id: string
  context_origin?: string
  context_en?: string
  metadata?: Record<string, any> | null
  role?: 'user' | 'assistant' | 'system'
  timestamp?: number
}

/**
 * 处理 memory_retrieval 工具调用
 * 从长期记忆中检索相关上下文
 */
export async function processMemoryRetrieval(
  args: MemoryRetrievalArgs
): Promise<MemoryRetrievalResponse> {
  try {
    console.log('[MemoryTools] Retrieving memories for query:', args.query)

    const results = await MemoryService.searchMemories(args.query, {
      chatId: args.chatId,
      topK: args.topK || 5,
      threshold: args.threshold || 0.6
    })

    if (results.length === 0) {
      return {
        success: true,
        count: 0,
        memories: [],
        message: 'No relevant memories found for the query.'
      }
    }

    // 格式化记忆结果
    const memories = results.map(result => ({
      id: result.entry.id,
      context_origin: result.entry.context_origin,
      context_en: result.entry.context_en,
      role: result.entry.role,
      similarity: result.similarity,
      timestamp: result.entry.timestamp,
      metadata: result.entry.metadata
    }))

    console.log(`[MemoryTools] Retrieved ${memories.length} relevant memories`)

    return {
      success: true,
      count: memories.length,
      memories,
      message: `Found ${memories.length} relevant memories.`
    }
  } catch (error) {
    console.error('[MemoryTools] Failed to retrieve memories:', error)
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      count: 0,
      memories: [],
      message: `Failed to retrieve memories: ${message}`
    }
  }
}

/**
 * 处理 memory_save 工具调用
 * 保存重要信息到长期记忆
 */
export async function processMemorySave(
  args: MemorySaveArgs
): Promise<MemorySaveResponse> {
  try {
    console.log('[MemoryTools] Saving memory for chat:', args.chatId)

    // 生成唯一的 messageId（使用时间戳）
    const messageId = Date.now()

    const memory = await MemoryService.addMemory({
      chatId: args.chatId,
      messageId,
      role: 'system',
      context_origin: args.context_origin,
      context_en: args.context_en,
      timestamp: Date.now(),
      metadata: args.metadata
    })

    console.log(`[MemoryTools] Memory saved successfully: ${memory.id}`)

    return {
      success: true,
      memoryId: memory.id,
      message: 'Memory saved successfully.'
    }
  } catch (error) {
    console.error('[MemoryTools] Failed to save memory:', error)
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to save memory: ${message}`
    }
  }
}

/**
 * 处理 memory_update 工具调用
 * 根据 id 更新已保存的记忆
 */
export async function processMemoryUpdate(
  args: MemoryUpdateArgs
): Promise<MemoryUpdateResponse> {
  try {
    console.log('[MemoryTools] Updating memory:', args.id)

    const updated = await MemoryService.updateMemory(args.id, {
      context_origin: args.context_origin,
      context_en: args.context_en,
      metadata: args.metadata,
      role: args.role,
      timestamp: args.timestamp
    })

    if (!updated) {
      return {
        success: false,
        message: 'Memory not found.'
      }
    }

    console.log(`[MemoryTools] Memory updated successfully: ${updated.id}`)

    return {
      success: true,
      memoryId: updated.id,
      message: 'Memory updated successfully.'
    }
  } catch (error) {
    console.error('[MemoryTools] Failed to update memory:', error)
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to update memory: ${message}`
    }
  }
}
