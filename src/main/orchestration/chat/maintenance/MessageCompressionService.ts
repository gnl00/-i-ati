/**
 * MessageCompressionService - 消息压缩服务
 *
 * 功能：
 * 1. 分析压缩策略（选择需要压缩的消息）
 * 2. 调用 LLM 生成摘要
 * 3. 保存压缩记录到数据库
 * 4. 避免并发压缩
 */

import { unifiedChatRequest } from '@main/request/index'
import { createUnifiedTextRequest } from '@main/request/UnifiedRequestFactory'
import { buildCompressionPrompt } from '@shared/prompts'
import DatabaseService from '@main/db/DatabaseService'
import { createLogger } from '@main/logging/LogService'
import { CompressionTranscriptBuilder } from './CompressionTranscriptBuilder'

const DEFAULT_TRIGGER_TOKEN_RATIO = 0.7
const RECENT_MESSAGE_PAIRS_TO_KEEP = 3
const logger = createLogger('MessageCompressionService')

export type CompressionJob = {
  chatId: number
  chatUuid: string
  messages: MessageEntity[]
  model: AccountModel
  account: ProviderAccount
  providerDefinition: ProviderDefinition
  config?: CompressionConfig
  usage?: ITokenUsage
}

export class MessageCompressionService {
  private compressionInProgress: Map<number, boolean> = new Map()

  constructor(private readonly transcriptBuilder = new CompressionTranscriptBuilder()) {}

  /**
   * 检查是否需要压缩
   */
  shouldCompress(
    usedTokenCount: number,
    contextWindowTokens: number | undefined,
    config?: CompressionConfig
  ): boolean {
    if (!config || !config.enabled) {
      return false
    }
    if (!contextWindowTokens || contextWindowTokens <= 0) {
      return false
    }

    return usedTokenCount / contextWindowTokens >= this.resolveTriggerTokenRatio(config)
  }

  /**
   * 分析压缩策略
   */
  analyzeCompressionStrategy(
    messages: MessageEntity[],
    existingSummaries: CompressedSummaryEntity[],
    model: AccountModel,
    config?: CompressionConfig
  ): CompressionStrategy {
    // 1. 创建已被压缩的消息 ID 集合
    const compressedIds = this.buildCompressedIdSet(existingSummaries)

    // 2. 过滤掉已被压缩的消息
    const uncompressedMessages = messages.filter(m =>
      m.id && !compressedIds.has(m.id)
    )

    // 3. 检查是否需要压缩
    if (!config) {
      return {
        shouldCompress: false,
        messagesToCompress: [],
        messagesToKeep: uncompressedMessages.map(m => m.id!),
        existingSummaries
      }
    }

    const usedTokenCount = this.sumResponseTokenCount(uncompressedMessages)
    const shouldCompress = this.shouldCompress(
      usedTokenCount,
      this.resolveContextWindowTokens(model),
      config
    )

    if (!shouldCompress) {
      return {
        shouldCompress: false,
        messagesToCompress: [],
        messagesToKeep: uncompressedMessages.map(m => m.id!),
        existingSummaries
      }
    }

    const sortedMessages = [...uncompressedMessages].sort(
      (a, b) => (a.id || 0) - (b.id || 0)
    )
    const { messagesToCompress, messagesToKeep } = this.selectRecentMessagePairWindow(
      sortedMessages
    )

    if (messagesToCompress.length === 0) {
      return {
        shouldCompress: false,
        messagesToCompress: [],
        messagesToKeep,
        existingSummaries
      }
    }

    return {
      shouldCompress: true,
      messagesToCompress,
      messagesToKeep,
      existingSummaries
    }
  }

  /**
   * 估算 token 数量
   */
  estimateTokenCount(text: string): number {
    // 简单估算：英文约 4 字符/token，中文约 1.5 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = text.length - chineseChars
    return Math.ceil(chineseChars / 1.5 + otherChars / 4)
  }

  sumResponseTokenCount(messages: MessageEntity[]): number {
    return messages.reduce((sum, message) => {
      const tokens = message.tokens
      if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) {
        return sum
      }
      return sum + tokens
    }, 0)
  }

  resolveContextWindowTokens(model: AccountModel): number | undefined {
    const tokens = model.contextWindowTokens
    if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) {
      return undefined
    }
    return Math.floor(tokens)
  }

  resolveTriggerTokenRatio(config?: CompressionConfig): number {
    const ratio = config?.triggerTokenRatio
    if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0) {
      return DEFAULT_TRIGGER_TOKEN_RATIO
    }
    return Math.min(ratio, 1)
  }

  private buildCompressedIdSet(existingSummaries: CompressedSummaryEntity[]): Set<number> {
    const compressedIds = new Set<number>()
    existingSummaries.forEach(summary => {
      summary.messageIds.forEach(id => compressedIds.add(id))
    })
    return compressedIds
  }

  private selectRecentMessagePairWindow(messages: MessageEntity[]): {
    messagesToCompress: number[]
    messagesToKeep: number[]
  } {
    const pairs = this.splitIntoMessagePairs(messages)
    const keepStartIndex = Math.max(0, pairs.length - RECENT_MESSAGE_PAIRS_TO_KEEP)
    const compressPairs = pairs.slice(0, keepStartIndex)
    const keepPairs = pairs.slice(keepStartIndex)

    return {
      messagesToCompress: compressPairs.flatMap(pair => this.collectMessageIds(pair)),
      messagesToKeep: keepPairs.flatMap(pair => this.collectMessageIds(pair))
    }
  }

  private splitIntoMessagePairs(messages: MessageEntity[]): MessageEntity[][] {
    const pairs: MessageEntity[][] = []
    let currentPair: MessageEntity[] = []

    messages.forEach(message => {
      if (message.body.role === 'user') {
        if (currentPair.length > 0) {
          pairs.push(currentPair)
        }
        currentPair = [message]
        return
      }

      currentPair.push(message)
    })

    if (currentPair.length > 0) {
      pairs.push(currentPair)
    }

    return pairs
  }

  private collectMessageIds(messages: MessageEntity[]): number[] {
    return messages
      .map(message => message.id)
      .filter((id): id is number => typeof id === 'number')
  }

  private buildCumulativeMessageIds(
    existingSummaries: CompressedSummaryEntity[],
    nextMessageIds: number[]
  ): number[] {
    const ids = this.buildCompressedIdSet(existingSummaries)
    nextMessageIds.forEach(id => ids.add(id))
    return Array.from(ids).sort((a, b) => a - b)
  }

  /**
   * 调用 LLM 生成摘要
   * @param messages 需要压缩的消息
   * @param model 使用的模型
   * @param provider 提供商
   * @param previousSummary 上一次的压缩摘要（如果存在）
   */
  async generateSummary(
    messages: MessageEntity[],
    model: AccountModel,
    account: ProviderAccount,
    providerDefinition: ProviderDefinition,
    previousSummary?: string
  ): Promise<string> {
    // 1. 构建对话文本
    const conversationText = this.transcriptBuilder.build(messages)

    // 2. 构建压缩 prompt（根据是否有旧摘要使用不同的 prompt）
    const userContent = buildCompressionPrompt({
      conversationText,
      previousSummary
    })

    // 3. 构建请求
    const request = createUnifiedTextRequest({
      adapterPluginId: providerDefinition.adapterPluginId,
      baseUrl: account.apiUrl,
      apiKey: account.apiKey,
      model: model.id,
      modelType: model.type,
      content: userContent,
      tools: [],
      stream: false
    })

    // 4. 调用 LLM API
    const response = await unifiedChatRequest(request, null, () => {}, () => {})

    // 5. 解析响应
    // // console.log('response', response);
    return response.content?.trim() || ''
  }

  /**
   * 执行压缩
   */
  async compress(job: CompressionJob): Promise<CompressionResult> {
    const { chatId, chatUuid, messages, model, account, providerDefinition, config, usage } = job
    if (!config || !config.enabled) {
      return { success: false, error: 'Compression disabled' }
    }
    // 1. 检查是否已在压缩中
    if (this.compressionInProgress.has(chatId)) {
      // console.log(`[Compression] Already compressing chat ${chatId}, skipping`)
      return { success: false, error: 'Already compressing' }
    }

    try {
      // 2. 标记为压缩中
      this.compressionInProgress.set(chatId, true)

      // 3. 获取已有的压缩摘要
      const existingSummaries = DatabaseService.getActiveCompressedSummariesByChatId(chatId)

      // 4. 分析压缩策略
      const strategy = this.analyzeCompressionStrategy(messages, existingSummaries, model, config)
      const compressedIds = this.buildCompressedIdSet(existingSummaries)
      const uncompressedMessages = messages.filter(m =>
        m.id && !compressedIds.has(m.id)
      )
      const usedTokenCount = this.sumResponseTokenCount(uncompressedMessages)
      const contextWindowTokens = this.resolveContextWindowTokens(model)
      const triggerTokenRatio = this.resolveTriggerTokenRatio(config)
      const tokenUsageRatio = contextWindowTokens
        ? Number((usedTokenCount / contextWindowTokens).toFixed(6))
        : undefined
      const thresholdTokenCount = contextWindowTokens
        ? Math.ceil(contextWindowTokens * triggerTokenRatio)
        : undefined
      let decisionReason = 'model_context_window_missing'
      if (contextWindowTokens) {
        decisionReason = strategy.shouldCompress ? 'threshold_reached' : 'below_threshold'
      }

      logger.info('compression.strategy.evaluated', {
        chatId,
        chatUuid,
        modelId: model.id,
        messageCount: messages.length,
        activeSummaryCount: existingSummaries.length,
        compressedMessageCount: compressedIds.size,
        uncompressedMessageCount: uncompressedMessages.length,
        messagesToCompressCount: strategy.messagesToCompress.length,
        usedTokenCount,
        contextWindowTokens,
        triggerTokenRatio,
        thresholdTokenCount,
        tokenUsageRatio,
        runPromptTokens: usage?.promptTokens,
        runCompletionTokens: usage?.completionTokens,
        runTotalTokens: usage?.totalTokens,
        runPromptCacheHitTokens: usage?.promptCacheHitTokens,
        runPromptCacheMissTokens: usage?.promptCacheMissTokens,
        runPromptCacheWriteTokens: usage?.promptCacheWriteTokens,
        runReasoningTokens: usage?.reasoningTokens,
        decisionBasis: 'historical_uncompressed_message_tokens',
        shouldCompress: strategy.shouldCompress,
        decisionReason
      })

      if (!strategy.shouldCompress) {
        // console.log('[Compression] No need to compress')
        return {
          success: true,
          usedTokenCount,
          contextWindowTokens,
          triggerTokenRatio,
          error: contextWindowTokens ? 'No need to compress' : 'Model context window tokens missing'
        }
      }

      // 5. 获取需要压缩的消息
      const messagesToCompress = messages.filter(m =>
        m.id && strategy.messagesToCompress.includes(m.id)
      )
      const cumulativeMessageIds = this.buildCumulativeMessageIds(
        existingSummaries,
        strategy.messagesToCompress
      )

      // 6. 获取最新的活跃摘要（如果存在）
      const latestSummary = existingSummaries.length > 0
        ? existingSummaries[existingSummaries.length - 1]
        : null

      // 7. 生成摘要（基于旧摘要 + 新消息）
      // console.log(`[Compression] Generating summary for ${messagesToCompress.length} messages`)
      if (latestSummary) {
        // console.log(`[Compression] Using previous summary as context`)
      }
      const summary = await this.generateSummary(
        messagesToCompress,
        model,
        account,
        providerDefinition,
        latestSummary?.summary
      )
      // console.log(`[Compression] Summary: ${summary}`)

      // 8. 估算 token 数量
      const originalTokenCount = this.estimateTokenCount(
        messagesToCompress.map(m => JSON.stringify(m.body)).join('')
      )
      const summaryTokenCount = this.estimateTokenCount(summary)
      const compressionRatio = originalTokenCount > 0
        ? summaryTokenCount / originalTokenCount
        : 0

      // 9. 将旧摘要标记为 superseded
      if (latestSummary && latestSummary.id) {
        // console.log(`[Compression] Marking previous summary ${latestSummary.id} as superseded`)
        DatabaseService.updateCompressedSummaryStatus(latestSummary.id, 'superseded')
      }

      // 10. 保存新的压缩记录
      const summaryEntity: CompressedSummaryEntity = {
        chatId,
        chatUuid,
        messageIds: cumulativeMessageIds,
        startMessageId: Math.min(...cumulativeMessageIds),
        endMessageId: Math.max(...cumulativeMessageIds),
        summary,
        originalTokenCount,
        summaryTokenCount,
        usedTokenCountAtCompression: usedTokenCount,
        compressionRatio,
        compressedAt: Date.now(),
        compressionModel: model.id,
        compressionVersion: 1,
        status: 'active'
      }

      const summaryId = DatabaseService.saveCompressedSummary(summaryEntity)

      // console.log(`[Compression] Saved summary ${summaryId}, ratio: ${compressionRatio.toFixed(2)}`)

      return {
        success: true,
        summaryId,
        summary,
        messageIds: cumulativeMessageIds,
        originalTokenCount,
        summaryTokenCount,
        usedTokenCount,
        contextWindowTokens,
        triggerTokenRatio,
        compressionRatio
      }
    } catch (error: any) {
      // console.error('[Compression] Failed to compress:', error)
      return {
        success: false,
        error: error.message || 'Unknown error'
      }
    } finally {
      // 9. 清除压缩标记
      this.compressionInProgress.delete(chatId)
    }
  }

  // Backward-compatible alias for IPC handler
  async execute(job: CompressionJob): Promise<CompressionResult> {
    return this.compress(job)
  }
}

// 导出单例
export const compressionService = new MessageCompressionService()
