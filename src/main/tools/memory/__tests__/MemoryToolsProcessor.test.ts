/**
 * Memory Tools Processor 单元测试
 * 测试 memory_retrieval 和 memory_save 工具的处理器
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { processMemoryRetrieval, processMemorySave } from '../main/MemoryToolsProcessor'
import MemoryService from '@main/services/memory/MemoryService'

// Mock MemoryService
vi.mock('@main/services/memory/MemoryService', () => {
  const mockMemories = new Map<string, any>()

  return {
    default: {
      initialize: vi.fn().mockResolvedValue(undefined),
      addMemory: vi.fn(async (entry) => {
        const id = `${entry.chatId}_${entry.messageId}_${Date.now()}`
        const memory = {
          ...entry,
          id,
          embedding: new Array(384).fill(0.1)
        }
        mockMemories.set(id, memory)
        return memory
      }),
      searchMemories: vi.fn(async (query, options = {}) => {
        const { chatId, topK = 5, threshold = 0.5 } = options
        const results: any[] = []

        mockMemories.forEach((memory) => {
          if (chatId !== undefined && memory.chatId !== chatId) {
            return
          }

          // 模拟相似度计算
          const similarity = query.includes('TypeScript') && memory.content.includes('TypeScript')
            ? 0.85
            : query.includes('programming') && memory.content.includes('programming')
            ? 0.75
            : 0.3

          if (similarity >= threshold) {
            results.push({
              entry: memory,
              similarity,
              rank: 0
            })
          }
        })

        return results
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, topK)
          .map((r, i) => ({ ...r, rank: i + 1 }))
      }),
      deleteMemory: vi.fn(async (id) => {
        const deleted = mockMemories.delete(id)
        return deleted
      }),
      clear: vi.fn(async () => {
        mockMemories.clear()
      })
    }
  }
})

describe('MemoryToolsProcessor', () => {
  const testChatId = 999
  let savedMemoryIds: string[] = []

  beforeAll(async () => {
    await MemoryService.initialize()
  })

  afterAll(async () => {
    await MemoryService.clear()
  })

  beforeEach(() => {
    savedMemoryIds = []
    vi.clearAllMocks()
  })

  afterEach(async () => {
    for (const id of savedMemoryIds) {
      await MemoryService.deleteMemory(id)
    }
  })

  describe('processMemorySave', () => {
    it('应该成功保存带完整 metadata 的记忆', async () => {
      const args = {
        content: 'User prefers TypeScript over JavaScript',
        chatId: testChatId,
        metadata: {
          category: 'preference',
          importance: 'high' as const,
          tags: ['programming', 'language']
        }
      }

      const response = await processMemorySave(args)

      expect(response.success).toBe(true)
      expect(response.memoryId).toBeDefined()
      expect(response.message).toBe('Memory saved successfully.')
      expect(MemoryService.addMemory).toHaveBeenCalledTimes(1)

      if (response.memoryId) {
        savedMemoryIds.push(response.memoryId)
      }
    })

    it('应该成功保存不带 metadata 的记忆', async () => {
      const args = {
        content: 'User is working on an Electron project',
        chatId: testChatId
      }

      const response = await processMemorySave(args)

      expect(response.success).toBe(true)
      expect(response.memoryId).toBeDefined()
      expect(MemoryService.addMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          content: args.content,
          chatId: args.chatId,
          role: 'system'
        })
      )

      if (response.memoryId) {
        savedMemoryIds.push(response.memoryId)
      }
    })

    it('应该验证 addMemory 被正确调用', async () => {
      const args = {
        content: 'Test memory content',
        chatId: testChatId,
        metadata: { category: 'test' }
      }

      await processMemorySave(args)

      expect(MemoryService.addMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: testChatId,
          role: 'system',
          content: 'Test memory content',
          metadata: { category: 'test' }
        })
      )
    })
  })

  describe('processMemoryRetrieval', () => {
    beforeEach(async () => {
      // 准备测试数据
      const testMemories = [
        { content: 'User prefers TypeScript for type safety', metadata: { category: 'preference' } },
        { content: 'User is building an Electron app', metadata: { category: 'project' } },
        { content: 'User likes functional programming style', metadata: { category: 'preference' } }
      ]

      for (const memory of testMemories) {
        const response = await processMemorySave({
          content: memory.content,
          chatId: testChatId,
          metadata: memory.metadata
        })
        if (response.memoryId) {
          savedMemoryIds.push(response.memoryId)
        }
      }
    })

    it('应该成功检索相关记忆', async () => {
      const args = {
        query: 'TypeScript',
        chatId: testChatId,
        topK: 5,
        threshold: 0.3
      }

      const response = await processMemoryRetrieval(args)

      expect(response.success).toBe(true)
      expect(response.count).toBeGreaterThan(0)
      expect(response.memories).toBeDefined()
      expect(Array.isArray(response.memories)).toBe(true)
      expect(MemoryService.searchMemories).toHaveBeenCalledTimes(1)
    })

    it('应该返回带相似度分数的记忆', async () => {
      const args = {
        query: 'TypeScript',
        chatId: testChatId,
        topK: 3,
        threshold: 0.3
      }

      const response = await processMemoryRetrieval(args)

      expect(response.success).toBe(true)
      if (response.memories.length > 0) {
        const memory = response.memories[0]
        expect(memory.content).toBeDefined()
        expect(memory.similarity).toBeDefined()
        expect(memory.similarity).toBeGreaterThanOrEqual(0)
        expect(memory.similarity).toBeLessThanOrEqual(1)
      }
    })

    it('应该遵守 topK 参数限制', async () => {
      const args = {
        query: 'programming',
        chatId: testChatId,
        topK: 2,
        threshold: 0.1
      }

      const response = await processMemoryRetrieval(args)

      expect(response.success).toBe(true)
      expect(response.memories.length).toBeLessThanOrEqual(2)
    })

    it('应该遵守 threshold 阈值过滤', async () => {
      const args = {
        query: 'unrelated text',
        chatId: testChatId,
        topK: 5,
        threshold: 0.9
      }

      const response = await processMemoryRetrieval(args)

      expect(response.success).toBe(true)
      expect(response.count).toBeLessThanOrEqual(1)
    })

    it('应该在无匹配时返回空结果', async () => {
      const args = {
        query: 'asdfghjkl qwertyuiop',
        chatId: testChatId,
        topK: 5,
        threshold: 0.95
      }

      const response = await processMemoryRetrieval(args)

      expect(response.success).toBe(true)
      expect(response.count).toBe(0)
      expect(response.memories).toEqual([])
      expect(response.message).toContain('No relevant memories found')
    })

    it('应该按 chatId 过滤记忆', async () => {
      const otherChatId = 888
      const otherResponse = await processMemorySave({
        content: 'This is from another chat',
        chatId: otherChatId
      })
      if (otherResponse.memoryId) {
        savedMemoryIds.push(otherResponse.memoryId)
      }

      const args = {
        query: 'chat',
        chatId: testChatId,
        topK: 10,
        threshold: 0.1
      }

      const response = await processMemoryRetrieval(args)

      expect(response.success).toBe(true)
      expect(MemoryService.searchMemories).toHaveBeenCalledWith(
        'chat',
        expect.objectContaining({ chatId: testChatId })
      )
    })
  })
})
