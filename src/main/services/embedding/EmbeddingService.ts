/**
 * EmbeddingService - 本地 Embedding 模型服务
 * 使用 transformers.js 和本地 all-MiniLM-L6-v2 模型
 * 在 Electron 主进程中运行，提供稳定可靠的 embedding 生成能力
 */

import { pipeline, env } from '@xenova/transformers'
import path from 'path'
import { app } from 'electron'

// 配置 transformers.js 环境
env.allowLocalModels = true
env.allowRemoteModels = false // 强制使用本地模型，避免下载

interface EmbeddingResult {
  embedding: number[]
  dimensions: number
  model: string
}

interface BatchEmbeddingResult {
  embeddings: number[][]
  dimensions: number
  model: string
  count: number
}

class EmbeddingService {
  private static instance: EmbeddingService
  private pipeline: any = null
  private modelPath: string
  private isInitialized: boolean = false
  private initializationPromise: Promise<void> | null = null
  private readonly MODEL_NAME = 'all-MiniLM-L6-v2'
  private readonly EMBEDDING_DIMENSIONS = 384

  private constructor() {
    // 获取模型路径
    // transformers.js 会在 localModelPath 下查找 Xenova/MODEL_NAME
    // 所以我们需要设置 localModelPath 为 models 目录
    const isDev = !app.isPackaged

    if (isDev) {
      // 开发环境: resources/models/
      this.modelPath = path.join(process.cwd(), 'resources', 'models')
    } else {
      // 生产环境
      this.modelPath = path.join(process.resourcesPath, 'models')
    }

    console.log('[EmbeddingService] Model path:', this.modelPath)
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService()
    }
    return EmbeddingService.instance
  }

  /**
   * 初始化模型
   * 支持并发调用，确保只初始化一次
   */
  public async initialize(): Promise<void> {
    // 如果已经初始化，直接返回
    if (this.isInitialized) {
      return
    }

    // 如果正在初始化，等待初始化完成
    if (this.initializationPromise) {
      return this.initializationPromise
    }

    // 开始初始化
    this.initializationPromise = this._initialize()

    try {
      await this.initializationPromise
    } finally {
      this.initializationPromise = null
    }
  }

  private async _initialize(): Promise<void> {
    try {
      console.log('[EmbeddingService] Initializing embedding model...')
      const startTime = Date.now()

      // 设置本地模型路径
      env.localModelPath = this.modelPath

      // 加载 feature-extraction pipeline
      // 使用量化的 ONNX 模型以获得更好的性能
      this.pipeline = await pipeline(
        'feature-extraction',
        `${this.MODEL_NAME}`,
        {
          quantized: true, // 使用量化模型
          // 如果需要指定 revision，可以添加：
          // revision: 'main'
        }
      )

      this.isInitialized = true
      const elapsed = Date.now() - startTime
      console.log(`[EmbeddingService] Model initialized successfully in ${elapsed}ms`)
    } catch (error) {
      console.error('[EmbeddingService] Failed to initialize model:', error)
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to initialize embedding model: ${message}`)
    }
  }

  /**
   * 生成单个文本的 embedding
   * @param text 输入文本
   * @param options 可选配置
   * @returns embedding 向量
   */
  public async generateEmbedding(
    text: string,
    options?: {
      pooling?: 'mean' | 'cls' // 池化策略
      normalize?: boolean // 是否归一化
    }
  ): Promise<EmbeddingResult> {
    // 确保模型已初始化
    await this.initialize()

    if (!text || text.trim().length === 0) {
      throw new Error('Input text cannot be empty')
    }

    try {
      const startTime = Date.now()

      // 生成 embedding
      // transformers.js 的 feature-extraction pipeline 默认返回归一化的 mean pooling
      const output = await this.pipeline(text, {
        pooling: options?.pooling || 'mean',
        normalize: options?.normalize !== false, // 默认归一化
      })

      // 转换为普通数组
      const embedding = Array.from(output.data) as number[]

      const elapsed = Date.now() - startTime
      console.log(`[EmbeddingService] Generated embedding in ${elapsed}ms, dimensions: ${embedding.length}`)

      return {
        embedding,
        dimensions: embedding.length,
        model: this.MODEL_NAME,
      }
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate embedding:', error)
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to generate embedding: ${message}`)
    }
  }

  /**
   * 批量生成 embeddings
   * @param texts 文本数组
   * @param options 可选配置
   * @returns embeddings 数组
   */
  public async generateBatchEmbeddings(
    texts: string[],
    options?: {
      pooling?: 'mean' | 'cls'
      normalize?: boolean
      batchSize?: number // 批次大小，避免内存溢出
    }
  ): Promise<BatchEmbeddingResult> {
    // 确保模型已初始化
    await this.initialize()

    if (!texts || texts.length === 0) {
      throw new Error('Input texts array cannot be empty')
    }

    // 过滤空文本
    const validTexts = texts.filter(t => t && t.trim().length > 0)
    if (validTexts.length === 0) {
      throw new Error('No valid texts to process')
    }

    try {
      const startTime = Date.now()
      const batchSize = options?.batchSize || 32
      const embeddings: number[][] = []

      // 分批处理
      for (let i = 0; i < validTexts.length; i += batchSize) {
        const batch = validTexts.slice(i, i + batchSize)

        // 处理当前批次
        const batchResults = await Promise.all(
          batch.map(text => this.generateEmbedding(text, options))
        )

        embeddings.push(...batchResults.map(r => r.embedding))

        console.log(`[EmbeddingService] Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validTexts.length / batchSize)}`)
      }

      const elapsed = Date.now() - startTime
      console.log(`[EmbeddingService] Generated ${embeddings.length} embeddings in ${elapsed}ms`)

      return {
        embeddings,
        dimensions: this.EMBEDDING_DIMENSIONS,
        model: this.MODEL_NAME,
        count: embeddings.length,
      }
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate batch embeddings:', error)
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to generate batch embeddings: ${message}`)
    }
  }

  /**
   * 计算两个 embedding 向量的余弦相似度
   * @param embedding1 第一个向量
   * @param embedding2 第二个向量
   * @returns 相似度分数 [-1, 1]，越接近 1 越相似
   */
  public static cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions')
    }

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }

    // 避免除以零
    if (norm1 === 0 || norm2 === 0) {
      return 0
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }

  /**
   * 获取模型信息
   */
  public getModelInfo() {
    return {
      name: this.MODEL_NAME,
      dimensions: this.EMBEDDING_DIMENSIONS,
      modelPath: this.modelPath,
      isInitialized: this.isInitialized,
    }
  }

  /**
   * 清理资源
   */
  public async dispose(): Promise<void> {
    if (this.pipeline) {
      // transformers.js 的 pipeline 会自动清理
      this.pipeline = null
      this.isInitialized = false
      console.log('[EmbeddingService] Resources disposed')
    }
  }
}

// 导出单例实例
export default EmbeddingService.getInstance()

// 同时导出类，以便访问静态方法
export { EmbeddingService }
