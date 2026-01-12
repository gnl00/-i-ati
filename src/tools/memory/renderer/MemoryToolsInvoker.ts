import type { MemoryRetrievalResponse, MemorySaveResponse } from '../index'

/**
 * Memory Tools Invoker - 渲染进程端
 * 通过 IPC 调用主进程的 memory 工具处理器
 */

interface MemoryRetrievalArgs {
  query: string
  chatId?: number
  topK?: number
  threshold?: number
}

interface MemorySaveArgs {
  content: string
  chatId: number
  metadata?: {
    category?: string
    importance?: 'low' | 'medium' | 'high'
    tags?: string[]
  }
}

/**
 * 调用 memory_retrieval 工具
 */
export async function invokeMemoryRetrieval(
  args: MemoryRetrievalArgs
): Promise<MemoryRetrievalResponse> {
  try {
    const response = await window.electron.ipcRenderer.invoke('memory-retrieval-action', args)
    return response
  } catch (error) {
    console.error('[MemoryToolsInvoker] Failed to invoke memory_retrieval:', error)
    return {
      success: false,
      count: 0,
      memories: [],
      message: `Failed to retrieve memories: ${error.message}`
    }
  }
}

/**
 * 调用 memory_save 工具
 */
export async function invokeMemorySave(
  args: MemorySaveArgs
): Promise<MemorySaveResponse> {
  try {
    const response = await window.electron.ipcRenderer.invoke('memory-save-action', args)
    return response
  } catch (error) {
    console.error('[MemoryToolsInvoker] Failed to invoke memory_save:', error)
    return {
      success: false,
      message: `Failed to save memory: ${error.message}`
    }
  }
}
