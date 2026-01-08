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
import { extractContentFromSegments } from './segment-utils'
import { formatWebSearchForLLM } from '../utils'

/**
 * 流式编排器回调
 */
export interface StreamingOrchestratorCallbacks {
  onPhaseChange?: (phase: 'receiving' | 'toolCall') => void
}

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
  /** 回调函数 */
  callbacks?: StreamingOrchestratorCallbacks
}

/**
 * 工具结果格式化函数
 */
const handleToolCallResult = (functionName: string, results: any) => {
  return functionName === 'web_search'
    ? formatWebSearchForLLM(results)
    : JSON.stringify({ ...results, functionCallCompleted: true })
}

/**
 * StreamingOrchestrator - 流式编排器
 */
export class StreamingOrchestrator {
  // 不变的属性：在构造函数中解构
  private readonly context: StreamingContext
  private readonly request: IUnifiedRequest
  private readonly modelName: string
  private readonly signal: AbortSignal
  private readonly callbacks?: StreamingOrchestratorCallbacks

  constructor(private readonly config: StreamingOrchestratorConfig) {
    // 解构常用的不变属性
    this.context = config.context
    this.request = config.context.request as IUnifiedRequest
    this.modelName = config.context.meta.model.name
    this.signal = config.signal
    this.callbacks = config.callbacks
  }

  // 会变化的属性：使用 getter
  private get tools() {
    return this.context.streaming.tools
  }

  /**
   * 获取待执行的工具（状态为 pending）
   */
  private getPendingTools() {
    return this.tools.filter(t => t.status === 'pending')
  }

  /**
   * 执行完整的请求-工具调用循环
   * 外部接口，由 createStreamingV2 调用
   */
  async execute(): Promise<void> {
    let cycleCount = 0
    const MAX_CYCLES = 10  // 防止无限循环

    while (cycleCount < MAX_CYCLES) {
      cycleCount++
      console.log(`[Orchestrator] Starting cycle ${cycleCount}`)

      // 执行单次周期
      await this.executeSingleCycle()

      // 检查是否需要继续（没有新的工具调用则退出）
      if (!this.hasToolCalls()) {
        console.log(`[Orchestrator] No more tool calls, completed in ${cycleCount} cycles`)
        break
      }

      console.log(`[Orchestrator] Tool calls detected, continuing to next cycle`)
    }

    if (cycleCount >= MAX_CYCLES) {
      console.warn(`[Orchestrator] Max cycles (${MAX_CYCLES}) reached, stopping`)
    }
  }

  /**
   * 执行单次请求-响应-工具调用周期
   * 私有方法，由 execute() 循环调用
   */
  private async executeSingleCycle(): Promise<void> {
    // 通知进入 receiving 阶段
    this.callbacks?.onPhaseChange?.('receiving')

    // 1. 发送请求并处理响应
    await this.sendRequest()

    // 2. 如果有工具调用，执行工具
    if (this.hasToolCalls()) {
      // 通知进入 toolCall 阶段
      this.callbacks?.onPhaseChange?.('toolCall')

      await this.executeToolCalls()
    }
  }

  /**
   * 检查是否有待执行的工具调用
   */
  private hasToolCalls(): boolean {
    return this.getPendingTools().length > 0
  }

  /**
   * 发送请求并处理响应
   */
  private async sendRequest(): Promise<void> {
    try {
      // 清空上一轮的工具调用（移除所有非 pending 状态的工具）
      // 保留 pending 状态的工具，它们将在本轮被执行
      this.context.streaming.tools = this.tools.filter(t => t.status === 'pending')

      const response = await unifiedChatRequest(
        this.request,
        this.signal,
        this.config.deps.beforeFetch,
        this.config.deps.afterFetch
      )

      if (this.request.stream === false) {
        this.processNonStreamingResponse(response as IUnifiedResponse)
      } else {
        await this.processStreamingResponse(response as AsyncIterable<IUnifiedResponse>)
      }
    } catch (error) {
      if (error instanceof AbortError || (error as Error).name === 'AbortError') {
        throw error
      }
      throw error
    }
  }

  /**
   * 处理流式响应
   */
  private async processStreamingResponse(
    response: AsyncIterable<IUnifiedResponse>
  ): Promise<void> {
    for await (const chunk of response) {
      if (this.signal.aborted) {
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
        model: this.modelName,
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
    const result = this.config.parser.parse(chunk, this.tools)

    // 2. 更新工具调用列表
    this.context.streaming.tools = result.toolCalls

    // 3. 应用解析结果
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
    const pendingTools = this.getPendingTools()
    if (pendingTools.length === 0) {
      return
    }

    const lastMessage = this.config.messageManager.getLastMessage()

    // 从 segments 中重建 content
    const content = extractContentFromSegments(lastMessage.body.segments)

    // 构造工具调用列表
    const toolCalls = pendingTools.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: tc.args
      }
    }))

    // 使用 MessageManager 统一处理工具调用消息
    this.config.messageManager.addToolCallMessage(toolCalls, content)
  }

  /**
   * 执行工具调用
   */
  private async executeToolCalls(): Promise<void> {
    const pendingTools = this.getPendingTools()
    if (pendingTools.length === 0) {
      return
    }

    // 标记工具为执行中
    pendingTools.forEach(tool => {
      tool.status = 'executing'
    })

    // 创建 ToolExecutor
    const executor = new ToolExecutor({
      maxConcurrency: 3,
      signal: this.signal,
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

    // 并发执行所有工具（转换为 ToolCallProps 格式）
    const toolCallProps = pendingTools.map(t => ({
      id: t.id,
      index: t.index,
      function: t.name,
      args: t.args
    }))
    const results = await executor.execute(toolCallProps)

    // 处理结果并更新工具状态
    for (const result of results) {
      // 找到对应的工具并更新状态
      const tool = this.tools.find(t => t.id === result.id)
      if (!tool) continue

      if (result.status === 'success') {
        tool.status = 'success'
        tool.result = result.content
        tool.cost = result.cost
        this.handleToolSuccess(result)
      } else {
        tool.status = result.status === 'aborted' ? 'aborted' : 'failed'
        tool.error = result.error?.message
        tool.cost = result.cost
        this.handleToolFailure(result)
      }
    }
  }

  /**
   * 处理工具执行成功
   */
  private handleToolSuccess(result: ToolExecutionResult): void {
    const toolFunctionMessage: ChatMessage = {
      role: 'tool',
      name: result.name,
      toolCallId: result.id,
      content: handleToolCallResult(result.name, result.content),
      segments: []
    }

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
