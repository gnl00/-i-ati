/**
 * MessageCompressionService - 消息压缩服务
 *
 * 功能：
 * 1. 分析压缩策略（选择需要压缩的消息）
 * 2. 调用 LLM 生成摘要
 * 3. 保存压缩记录到数据库
 * 4. 避免并发压缩
 */

import { unifiedChatRequest } from '@request/index'
import { buildCompressionPrompt } from '@shared/prompts'
import DatabaseService from './DatabaseService'

export type CompressionJob = {
  chatId: number
  chatUuid: string
  messages: MessageEntity[]
  model: AccountModel
  account: ProviderAccount
  providerDefinition: ProviderDefinition
  config?: CompressionConfig
}

class MessageCompressionService {
  private compressionInProgress: Map<number, boolean> = new Map()

  /**
   * 检查是否需要压缩
   */
  shouldCompress(messageCount: number, config?: CompressionConfig): boolean {
    if (!config || !config.enabled) {
      return false
    }
    return messageCount >= config.triggerThreshold
  }

  /**
   * 分析压缩策略
   */
  analyzeCompressionStrategy(
    messages: MessageEntity[],
    existingSummaries: CompressedSummaryEntity[],
    config?: CompressionConfig
  ): CompressionStrategy {
    // 1. 创建已被压缩的消息 ID 集合
    const compressedIds = new Set<number>()
    existingSummaries.forEach(summary => {
      summary.messageIds.forEach(id => compressedIds.add(id))
    })

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

    const shouldCompress = uncompressedMessages.length >= config.triggerThreshold

    if (!shouldCompress) {
      return {
        shouldCompress: false,
        messagesToCompress: [],
        messagesToKeep: uncompressedMessages.map(m => m.id!),
        existingSummaries
      }
    }

    // 4. 计算需要压缩的消息数量
    const compressCount = Math.min(
      config.compressCount,
      uncompressedMessages.length - config.keepRecentCount
    )

    if (compressCount <= 0) {
      return {
        shouldCompress: false,
        messagesToCompress: [],
        messagesToKeep: uncompressedMessages.map(m => m.id!),
        existingSummaries
      }
    }

    // 5. 选择最老的 N 条消息进行压缩
    const sortedMessages = [...uncompressedMessages].sort(
      (a, b) => (a.id || 0) - (b.id || 0)
    )
    const toCompress = sortedMessages.slice(0, compressCount)
    const toKeep = sortedMessages.slice(compressCount)

    const pairedCompress = this.addToolPairs(toCompress, sortedMessages)
    const pairedIds = new Set(pairedCompress.map(m => m.id!))
    const nextToKeep = sortedMessages.filter(m => !pairedIds.has(m.id!))

    return {
      shouldCompress: true,
      messagesToCompress: pairedCompress.map(m => m.id!),
      messagesToKeep: nextToKeep.map(m => m.id!),
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

  /**
   * 将 toolCalls 与 tool responses 成对加入压缩集
   */
  private addToolPairs(toCompress: MessageEntity[], allMessages: MessageEntity[]): MessageEntity[] {
    const compressIds = new Set(toCompress.map(m => m.id!).filter(Boolean))
    const toolCallIds = new Set<string>()

    for (const message of toCompress) {
      const body = message.body
      if (body.role === 'assistant' && body.toolCalls && body.toolCalls.length > 0) {
        body.toolCalls.forEach(call => {
          if (call.id) {
            toolCallIds.add(call.id)
          }
        })
      }
      if (body.role === 'tool' && body.toolCallId) {
        toolCallIds.add(body.toolCallId)
      }
    }

    if (toolCallIds.size === 0) {
      return toCompress
    }

    const expanded = [...toCompress]
    for (const message of allMessages) {
      if (!message.id || compressIds.has(message.id)) continue
      const body = message.body
      if (body.role === 'assistant' && body.toolCalls && body.toolCalls.length > 0) {
        const hasMatch = body.toolCalls.some(call => call.id && toolCallIds.has(call.id))
        if (hasMatch) {
          expanded.push(message)
          compressIds.add(message.id)
        }
      } else if (body.role === 'tool' && body.toolCallId && toolCallIds.has(body.toolCallId)) {
        expanded.push(message)
        compressIds.add(message.id)
      }
    }

    return expanded.sort((a, b) => (a.id || 0) - (b.id || 0))
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
    const conversationText = messages
      .map(m => {
        const role = m.body.role
        const content = typeof m.body.content === 'string'
          ? m.body.content
          : JSON.stringify(m.body.content)
        return `${role}: ${content}`
      })
      .join('\n\n')

    // 2. 构建压缩 prompt（根据是否有旧摘要使用不同的 prompt）
    const userContent = buildCompressionPrompt({
      conversationText,
      previousSummary
    })

    // 3. 构建请求
    const request: IUnifiedRequest = {
      providerType: providerDefinition.adapterType,
      apiVersion: providerDefinition.apiVersion,
      baseUrl: account.apiUrl,
      messages: [{ role: 'user', content: userContent, segments: [] }],
      apiKey: account.apiKey,
      prompt: '',
      model: model.id,
      modelType: model.type,
      tools: [],
      stream: false
    }

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
    const { chatId, chatUuid, messages, model, account, providerDefinition, config } = job
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
      const strategy = this.analyzeCompressionStrategy(messages, existingSummaries, config)

      if (!strategy.shouldCompress) {
        // console.log('[Compression] No need to compress')
        return { success: false, error: 'No need to compress' }
      }

      // 5. 获取需要压缩的消息
      const messagesToCompress = messages.filter(m =>
        m.id && strategy.messagesToCompress.includes(m.id)
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
      const compressionRatio = summaryTokenCount / originalTokenCount

      // 9. 将旧摘要标记为 superseded
      if (latestSummary && latestSummary.id) {
        // console.log(`[Compression] Marking previous summary ${latestSummary.id} as superseded`)
        DatabaseService.updateCompressedSummaryStatus(latestSummary.id, 'superseded')
      }

      // 10. 保存新的压缩记录
      const summaryEntity: CompressedSummaryEntity = {
        chatId,
        chatUuid,
        messageIds: strategy.messagesToCompress,
        startMessageId: Math.min(...strategy.messagesToCompress),
        endMessageId: Math.max(...strategy.messagesToCompress),
        summary,
        originalTokenCount,
        summaryTokenCount,
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
        messageIds: strategy.messagesToCompress,
        originalTokenCount,
        summaryTokenCount,
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
