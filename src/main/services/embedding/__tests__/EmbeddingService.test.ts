/**
 * EmbeddingService 单元测试
 * 测试本地 Embedding 模型服务的核心功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EmbeddingService } from '../EmbeddingService'

const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
}))

// Mock @xenova/transformers
vi.mock('@xenova/transformers', () => {
  const mockPipeline = vi.fn()

  return {
    pipeline: mockPipeline,
    env: {
      allowLocalModels: true,
      allowRemoteModels: false,
      localModelPath: '',
    },
  }
})

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
  },
  existsSync: mockExistsSync,
}))

// Mock electron
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/mock/path'),
  },
}))

describe('EmbeddingService', () => {
  let service: EmbeddingService
  let mockPipelineInstance: any

  beforeEach(async () => {
    ;(EmbeddingService as any).instance = undefined

    // 重置所有 mock
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)

    // 创建 mock pipeline 实例
    mockPipelineInstance = vi.fn(async (text: string | string[], _options?: any) => {
      if (Array.isArray(text)) {
        const embedding = new Float32Array(384 * text.length).fill(0.1)
        return {
          data: embedding,
          dims: [text.length, 384]
        }
      }

      const embedding = new Float32Array(384).fill(0.1)
      return { data: embedding, dims: [384] }
    })

    // 配置 pipeline mock
    const { pipeline } = await import('@xenova/transformers')
    vi.mocked(pipeline).mockResolvedValue(mockPipelineInstance)

    // 获取服务实例
    service = EmbeddingService.getInstance()
  })

  afterEach(async () => {
    // 清理资源
    await service.dispose()
  })

  describe('单例模式', () => {
    it('应该返回同一个实例', () => {
      const instance1 = EmbeddingService.getInstance()
      const instance2 = EmbeddingService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('模型初始化', () => {
    it('应该成功初始化模型', async () => {
      await service.initialize()
      const { pipeline } = await import('@xenova/transformers')
      expect(pipeline).toHaveBeenCalledTimes(1)
      expect(pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'all-MiniLM-L6-v2',
        expect.objectContaining({
          quantized: true,
        })
      )
    })

    it('应该支持并发初始化，只初始化一次', async () => {
      const promises = [
        service.initialize(),
        service.initialize(),
        service.initialize(),
      ]
      await Promise.all(promises)

      const { pipeline } = await import('@xenova/transformers')
      // 应该只调用一次 pipeline
      expect(pipeline).toHaveBeenCalledTimes(1)
    })

    it('已初始化后再次调用应该直接返回', async () => {
      await service.initialize()
      const { pipeline } = await import('@xenova/transformers')
      const callCount = vi.mocked(pipeline).mock.calls.length

      await service.initialize()
      // 调用次数不应该增加
      expect(vi.mocked(pipeline).mock.calls.length).toBe(callCount)
    })
  })

  describe('模型路径解析', () => {
    it('开发环境应该使用项目 resources/models 目录', () => {
      const info = service.getModelInfo()

      expect(info.modelPath).toBe('/Users/gnl/Workspace/code/-i-ati/resources/models')
    })

    it('打包环境应该使用 Resources/models 目录', async () => {
      const { app } = await import('electron')
      const originalResourcesPath = process.resourcesPath

      ;(app as any).isPackaged = true

      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: '/mock/resources',
      })

      try {
        ;(EmbeddingService as any).instance = undefined
        const packagedService = EmbeddingService.getInstance()

        expect(packagedService.getModelInfo().modelPath).toBe(
          '/mock/resources/models'
        )
      } finally {
        ;(app as any).isPackaged = false
        Object.defineProperty(process, 'resourcesPath', {
          configurable: true,
          value: originalResourcesPath,
        })
      }
    })

    it('模型目录不存在时应该在初始化阶段抛出明确错误', async () => {
      const { app } = await import('electron')
      const originalResourcesPath = process.resourcesPath

      ;(app as any).isPackaged = true
      mockExistsSync.mockReturnValue(false)

      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: '/mock/resources',
      })

      try {
        ;(EmbeddingService as any).instance = undefined
        const packagedService = EmbeddingService.getInstance()

        await expect(packagedService.initialize()).rejects.toThrow(
          'Failed to initialize embedding model: Model directory not found: /mock/resources/models/all-MiniLM-L6-v2'
        )
      } finally {
        ;(app as any).isPackaged = false
        Object.defineProperty(process, 'resourcesPath', {
          configurable: true,
          value: originalResourcesPath,
        })
      }
    })
  })

  describe('生成单个 Embedding', () => {
    beforeEach(async () => {
      await service.initialize()
    })

    it('应该成功生成 embedding', async () => {
      const result = await service.generateEmbedding('测试文本')

      expect(result).toHaveProperty('embedding')
      expect(result).toHaveProperty('dimensions')
      expect(result).toHaveProperty('model')
      expect(result.embedding).toBeInstanceOf(Array)
      expect(result.dimensions).toBe(384)
      expect(result.model).toBe('all-MiniLM-L6-v2')
    })

    it('应该拒绝空文本', async () => {
      await expect(service.generateEmbedding('')).rejects.toThrow(
        'Input text cannot be empty'
      )
    })

    it('应该拒绝只有空格的文本', async () => {
      await expect(service.generateEmbedding('   ')).rejects.toThrow(
        'Input text cannot be empty'
      )
    })

    it('应该使用正确的选项调用 pipeline', async () => {
      const options = { pooling: 'cls' as const, normalize: false }
      await service.generateEmbedding('测试文本', options)

      expect(mockPipelineInstance).toHaveBeenCalledWith(
        '测试文本',
        expect.objectContaining({
          pooling: 'cls',
          normalize: false,
        })
      )
    })

    it('应该使用默认选项', async () => {
      await service.generateEmbedding('测试文本')

      expect(mockPipelineInstance).toHaveBeenCalledWith(
        '测试文本',
        expect.objectContaining({
          pooling: 'mean',
          normalize: true,
        })
      )
    })
  })

  describe('批量生成 Embeddings', () => {
    beforeEach(async () => {
      await service.initialize()
    })

    it('应该成功生成批量 embeddings', async () => {
      const texts = ['文本1', '文本2', '文本3']
      const result = await service.generateBatchEmbeddings(texts)

      expect(result).toHaveProperty('embeddings')
      expect(result).toHaveProperty('dimensions')
      expect(result).toHaveProperty('model')
      expect(result).toHaveProperty('count')
      expect(result.embeddings).toHaveLength(3)
      expect(result.count).toBe(3)
      expect(result.dimensions).toBe(384)
    })

    it('应该拒绝空数组', async () => {
      await expect(service.generateBatchEmbeddings([])).rejects.toThrow(
        'Input texts array cannot be empty'
      )
    })

    it('应该过滤掉空文本', async () => {
      const texts = ['文本1', '', '文本2', '   ', '文本3']
      const result = await service.generateBatchEmbeddings(texts)

      expect(result.count).toBe(3)
      expect(result.embeddings).toHaveLength(3)
    })

    it('应该在所有文本都为空时抛出错误', async () => {
      const texts = ['', '   ', '']
      await expect(service.generateBatchEmbeddings(texts)).rejects.toThrow(
        'No valid texts to process'
      )
    })

    it('应该支持自定义批次大小', async () => {
      const texts = Array.from({ length: 10 }, (_, i) => `文本${i}`)
      const result = await service.generateBatchEmbeddings(texts, { batchSize: 3 })

      expect(result.count).toBe(10)
      expect(result.embeddings).toHaveLength(10)
    })

    it('应该对批量输入直接使用 pipeline 数组调用', async () => {
      const texts = ['文本1', '文本2', '文本3', '文本4']
      await service.generateBatchEmbeddings(texts, { batchSize: 4 })

      expect(mockPipelineInstance).toHaveBeenCalledWith(
        texts,
        expect.objectContaining({
          pooling: 'mean',
          normalize: true
        })
      )
    })

    it('应该限制单次批量推理的最大批次数量', async () => {
      const texts = Array.from({ length: 25 }, (_, index) => `文本${index}`)
      mockPipelineInstance.mockClear()

      await service.generateBatchEmbeddings(texts, { batchSize: 96 })

      const arrayCalls = mockPipelineInstance.mock.calls
        .map(call => call[0])
        .filter((value): value is string[] => Array.isArray(value))

      expect(arrayCalls).toHaveLength(2)
      expect(arrayCalls[0]).toHaveLength(24)
      expect(arrayCalls[1]).toHaveLength(1)
    })

    it('应该按字符预算拆分大文本批次', async () => {
      const texts = [
        'a'.repeat(6000),
        'b'.repeat(6000),
        'c'.repeat(1000)
      ]
      mockPipelineInstance.mockClear()

      await service.generateBatchEmbeddings(texts, { batchSize: 16 })

      const arrayCalls = mockPipelineInstance.mock.calls
        .map(call => call[0])
        .filter((value): value is string[] => Array.isArray(value))

      expect(arrayCalls).toHaveLength(2)
      expect(arrayCalls[0]).toHaveLength(2)
      expect(arrayCalls[1]).toHaveLength(1)
    })
  })

  describe('余弦相似度计算', () => {
    it('应该正确计算相同向量的相似度', () => {
      const vec = [1, 2, 3, 4]
      const similarity = EmbeddingService.cosineSimilarity(vec, vec)
      expect(similarity).toBeCloseTo(1, 5)
    })

    it('应该正确计算正交向量的相似度', () => {
      const vec1 = [1, 0]
      const vec2 = [0, 1]
      const similarity = EmbeddingService.cosineSimilarity(vec1, vec2)
      expect(similarity).toBeCloseTo(0, 5)
    })

    it('应该正确计算相反向量的相似度', () => {
      const vec1 = [1, 2, 3]
      const vec2 = [-1, -2, -3]
      const similarity = EmbeddingService.cosineSimilarity(vec1, vec2)
      expect(similarity).toBeCloseTo(-1, 5)
    })

    it('应该正确计算一般向量的相似度', () => {
      const vec1 = [1, 2, 3]
      const vec2 = [4, 5, 6]
      const similarity = EmbeddingService.cosineSimilarity(vec1, vec2)
      // 手动计算: (1*4 + 2*5 + 3*6) / (sqrt(1+4+9) * sqrt(16+25+36))
      // = 32 / (sqrt(14) * sqrt(77))
      expect(similarity).toBeGreaterThan(0)
      expect(similarity).toBeLessThan(1)
    })

    it('应该拒绝不同维度的向量', () => {
      const vec1 = [1, 2, 3]
      const vec2 = [1, 2]
      expect(() => EmbeddingService.cosineSimilarity(vec1, vec2)).toThrow(
        'Embeddings must have the same dimensions'
      )
    })

    it('应该处理零向量', () => {
      const vec1 = [0, 0, 0]
      const vec2 = [1, 2, 3]
      const similarity = EmbeddingService.cosineSimilarity(vec1, vec2)
      expect(similarity).toBe(0)
    })
  })

  describe('获取模型信息', () => {
    it('应该返回正确的模型信息', () => {
      const info = service.getModelInfo()

      expect(info).toHaveProperty('name')
      expect(info).toHaveProperty('dimensions')
      expect(info).toHaveProperty('modelPath')
      expect(info).toHaveProperty('isInitialized')
      expect(info.name).toBe('all-MiniLM-L6-v2')
      expect(info.dimensions).toBe(384)
    })

    it('初始化前应该显示未初始化状态', () => {
      const info = service.getModelInfo()
      expect(info.isInitialized).toBe(false)
    })

    it('初始化后应该显示已初始化状态', async () => {
      await service.initialize()
      const info = service.getModelInfo()
      expect(info.isInitialized).toBe(true)
    })
  })

  describe('资源清理', () => {
    it('应该成功清理资源', async () => {
      await service.initialize()
      expect(service.getModelInfo().isInitialized).toBe(true)

      await service.dispose()
      expect(service.getModelInfo().isInitialized).toBe(false)
    })

    it('应该能够在清理后重新初始化', async () => {
      await service.initialize()
      await service.dispose()
      await service.initialize()

      expect(service.getModelInfo().isInitialized).toBe(true)
    })
  })

  describe('错误处理', () => {
    it('应该处理初始化失败的情况', async () => {
      const { pipeline } = await import('@xenova/transformers')
      vi.mocked(pipeline).mockRejectedValueOnce(new Error('模型加载失败'))

      // 需要清理并重新获取实例以触发新的初始化
      await service.dispose()

      await expect(service.initialize()).rejects.toThrow(
        'Failed to initialize embedding model'
      )
    })

    it('应该处理 embedding 生成失败的情况', async () => {
      await service.initialize()

      // Mock pipeline 实例抛出错误
      mockPipelineInstance.mockRejectedValueOnce(new Error('推理失败'))

      await expect(service.generateEmbedding('测试文本')).rejects.toThrow(
        'Failed to generate embedding'
      )
    })
  })

  describe('集成测试', () => {
    it('应该完成完整的工作流程', async () => {
      // 1. 初始化
      await service.initialize()
      expect(service.getModelInfo().isInitialized).toBe(true)

      // 2. 生成单个 embedding
      const result1 = await service.generateEmbedding('这是第一个测试文本')
      expect(result1.embedding).toHaveLength(384)

      // 3. 批量生成 embeddings
      const texts = ['文本A', '文本B', '文本C']
      const batchResult = await service.generateBatchEmbeddings(texts)
      expect(batchResult.count).toBe(3)

      // 4. 计算相似度
      const similarity = EmbeddingService.cosineSimilarity(
        batchResult.embeddings[0],
        batchResult.embeddings[1]
      )
      expect(similarity).toBeGreaterThanOrEqual(-1)
      expect(similarity).toBeLessThanOrEqual(1)

      // 5. 清理资源
      await service.dispose()
      expect(service.getModelInfo().isInitialized).toBe(false)
    })
  })
})
