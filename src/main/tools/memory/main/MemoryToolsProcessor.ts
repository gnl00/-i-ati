import MemoryService from '@main/services/memory/MemoryService'
import type { MemoryRetrievalResponse, MemorySaveResponse } from '@tools/memory/index.d'

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
    return {
      success: false,
      count: 0,
      memories: [],
      message: `Failed to retrieve memories: ${error.message}`
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
    return {
      success: false,
      message: `Failed to save memory: ${error.message}`
    }
  }
}
