/**
 * StreamingOrchestrator - 流式编排器
 *
 * 职责：
 * - 协调流式请求的发送和响应处理
 * - 处理流式和非流式响应
 * - 编排工具调用的执行
 * - 管理 chunk 解析和消息更新
 *
 * 设计原则：
 * - 单一职责：只负责编排，不负责状态管理
 * - 依赖注入：所有依赖通过构造函数注入
 * - 无状态：不维护自己的状态，只操作传入的 context
 */

import { unifiedChatRequest } from '@request/index'
import { v4 as uuidv4 } from 'uuid'
import type {
  StreamingContext,
  StreamingDeps
} from '../types'
import { AbortError } from '../errors'
import type { ChunkParser } from './parser'
import type { MessageManager } from './message-manager'
import { ToolExecutor } from './executor'
import type { ToolExecutionProgress, ToolExecutionResult } from './executor/types'
import { SegmentBuilder } from './parser'
import type { ParseResult } from './parser/types'

/**
 * 流式编排器配置
 */
export interface StreamingOrchestratorConfig {
  /** 流式上下文 */
  context: StreamingContext
  /** 依赖注入 */
  deps: StreamingDeps
  /** Chunk 解析器 */
  parser: ChunkParser
  /** 消息管理器 */
  messageManager: MessageManager
  /** 中止信号 */
  signal: AbortSignal
}

/**
 * 工具结果格式化函数
 */
const handleToolCallResult = (functionName: string, results: any) => {
  return functionName === 'web_search'
    ? require('../utils').formatWebSearchForLLM(results)
    : JSON.stringify({ ...results, functionCallCompleted: true })
}

/**
 * StreamingOrchestrator - 流式编排器
 */
export class StreamingOrchestrator {
  constructor(private readonly config: StreamingOrchestratorConfig) {}

  /**
   * 执行单次请求-响应-工具调用循环
   */
  async executeRequestCycle(): Promise<void> {
    // 1. 发送请求并处理响应
    await this.sendRequest()

    // 2. 如果有工具调用，执行工具
    if (this.hasToolCalls()) {
      await this.executeToolCalls()
    }
  }

  /**
   * 检查是否有工具调用
   */
  private hasToolCalls(): boolean {
    const toolRuntime = this.config.context.streaming.tools
    return toolRuntime.hasToolCall && toolRuntime.toolCalls.length > 0
  }

  /**
   * 发送请求并处理响应
   */
  private async sendRequest(): Promise<void> {
    const response = await unifiedChatRequest(
      this.config.context.request as IUnifiedRequest,
      this.config.signal,
      this.config.deps.beforeFetch,
      this.config.deps.afterFetch
    )

    if (this.config.context.request.stream === false) {
      this.processNonStreamingResponse(response as IUnifiedResponse)
    } else {
      await this.processStreamingResponse(response as AsyncIterable<IUnifiedResponse>)
    }
  }

  /**
   * 处理流式响应
   */
  private async processStreamingResponse(
    response: AsyncIterable<IUnifiedResponse>
  ): Promise<void> {
    for await (const chunk of response) {
      if (this.config.signal.aborted) {
        throw new AbortError()
      }
      this.handleChunk(chunk)
    }

    this.flushToolCallPlaceholder()
  }

  /**
   * 处理非流式响应
   */
  private processNonStreamingResponse(resp: IUnifiedResponse): void {
    this.config.messageManager.updateLastMessage(() => ({
      body: {
        role: 'assistant',
        model: this.config.context.meta.model.name,
        content: resp.content,
        segments: [{
          type: 'text',
          content: resp.content,
          timestamp: Date.now()
        }]
      }
    }))
  }

  /**
   * 处理单个 chunk
   */
  private handleChunk(chunk: IUnifiedResponse): void {
    // 1. 解析 chunk
    const result = this.config.parser.parse(chunk, this.config.context.streaming)

    // 2. 更新流式状态
    this.config.context.streaming.tools.toolCalls = result.toolCalls
    this.config.context.streaming.tools.hasToolCall = result.toolCalls.length > 0
    this.config.context.streaming.isContentHasThinkTag = result.isInThinkTag

    // 3. 更新 gatherContent 和 gatherReasoning
    if (result.contentDelta) {
      this.config.context.streaming.gatherContent += result.contentDelta
    }
    if (result.reasoningDelta) {
      this.config.context.streaming.gatherReasoning += result.reasoningDelta
    }

    // 4. 应用解析结果
    this.applyParseResult(result)
  }

  /**
   * 应用解析结果到消息
   */
  private applyParseResult(result: ParseResult): void {
    const segmentBuilder = new SegmentBuilder()
    const lastMessage = this.config.messageManager.getLastMessage()

    if (!lastMessage.body.segments) {
      this.config.messageManager.updateLastMessage(msg => {
        msg.body.segments = []
        return msg
      })
    }

    let segments = [...(lastMessage.body.segments || [])]

    // 应用 reasoning delta
    if (result.reasoningDelta.trim()) {
      segments = segmentBuilder.appendSegment(segments, result.reasoningDelta, 'reasoning')
    }

    // 应用 text delta
    if (result.contentDelta.trim()) {
      segments = segmentBuilder.appendSegment(segments, result.contentDelta, 'text')
    }

    // 原子更新
    this.config.messageManager.updateLastMessage(msg => ({
      ...msg,
      body: {
        ...msg.body,
        segments
      }
    }))
  }

  /**
   * 刷新工具调用占位符
   */
  private flushToolCallPlaceholder(): void {
    const toolRuntime = this.config.context.streaming.tools

    if (!toolRuntime.hasToolCall || toolRuntime.toolCalls.length === 0) {
      return
    }

    const lastMessage = this.config.messageManager.getLastMessage()

    const assistantToolCallMessage: ChatMessage = {
      role: 'assistant',
      content: this.config.context.streaming.gatherContent || '',
      segments: [],
      toolCalls: toolRuntime.toolCalls.map(tc => ({
        id: tc.id || `call_${uuidv4()}`,
        type: 'function',
        function: {
          name: tc.function,
          arguments: tc.args
        }
      }))
    }

    this.config.context.request.messages.push(assistantToolCallMessage)

    this.config.messageManager.updateLastMessage(() => ({
      body: {
        role: 'assistant',
        content: this.config.context.streaming.gatherContent || '',
        model: this.config.context.meta.model.name,
        segments: lastMessage.body.segments,
        toolCalls: assistantToolCallMessage.toolCalls
      }
    }))
  }

  /**
   * 执行工具调用
   */
  private async executeToolCalls(): Promise<void> {
    const toolRuntime = this.config.context.streaming.tools

    if (toolRuntime.toolCalls.length === 0) {
      return
    }

    // 创建 ToolExecutor
    const executor = new ToolExecutor({
      maxConcurrency: 3,
      signal: this.config.signal,
      onProgress: (progress: ToolExecutionProgress) => {
        if (progress.phase === 'started') {
          console.log(`[Tool] Starting: ${progress.name}`)
        } else if (progress.phase === 'completed') {
          console.log(`[Tool] Completed: ${progress.name} (${progress.result?.cost}ms)`)
        } else if (progress.phase === 'failed') {
          console.error(`[Tool] Failed: ${progress.name}`, progress.result?.error)
        }
      }
    })

    // 并发执行所有工具
    const results = await executor.execute(toolRuntime.toolCalls)

    // 处理结果
    for (const result of results) {
      if (result.status === 'success') {
        this.handleToolSuccess(result)
      } else {
        this.handleToolFailure(result)
      }
    }

    // 清理
    toolRuntime.toolCalls = []
    toolRuntime.hasToolCall = false
  }

  /**
   * 处理工具执行成功
   */
  private handleToolSuccess(result: ToolExecutionResult): void {
    const toolRuntime = this.config.context.streaming.tools

    const toolFunctionMessage: ChatMessage = {
      role: 'tool',
      name: result.name,
      toolCallId: result.id,
      content: handleToolCallResult(result.name, result.content),
      segments: []
    }

    // 初始化 toolCallResults
    if (!toolRuntime.toolCallResults) {
      toolRuntime.toolCallResults = []
    }

    toolRuntime.toolCallResults.push({
      name: result.name,
      content: result.content,
      cost: result.cost
    })

    // 添加 toolCall segment
    this.config.messageManager.appendSegmentToLastMessage({
      type: 'toolCall',
      name: result.name,
      content: result.content,
      cost: result.cost,
      timestamp: Date.now()
    })

    // 添加 tool result 消息
    this.config.messageManager.addToolResultMessage(toolFunctionMessage)
  }

  /**
   * 处理工具执行失败
   */
  private handleToolFailure(result: ToolExecutionResult): void {
    console.error(`[Tool] Execution failed:`, {
      name: result.name,
      status: result.status,
      error: result.error,
      cost: result.cost
    })

    // 添加错误 segment 用于 UI 显示
    this.config.messageManager.appendSegmentToLastMessage({
      type: 'toolCall',
      name: result.name,
      content: {
        error: result.error?.message || 'Unknown error',
        status: result.status
      },
      cost: result.cost,
      timestamp: Date.now()
    })
  }
}
