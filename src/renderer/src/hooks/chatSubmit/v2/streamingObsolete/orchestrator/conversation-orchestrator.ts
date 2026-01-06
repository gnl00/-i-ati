/**
 * 对话编排器
 * 协调传输、解析、工具执行、状态管理各层
 */

import { v4 as uuidv4 } from 'uuid'
import type { PreparedRequest, StreamingContext, StreamingState } from '../../types'
import { formatWebSearchForLLM } from '../../utils'
import { ParallelToolExecutor } from '../executor/parallel-executor'
import { ChunkParser } from '../parser/chunk-parser'
import { SegmentBuilder } from '../parser/segment-builder'
import { MessageManager } from '../state/message-manager'
import { UnifiedChatTransport } from '../transport/stream-transport'
import type {
  OrchestratorCallbacks,
  OrchestratorConfig,
  OrchestratorPhase,
  ParseResult,
  ToolExecutionResult
} from '../types'

/**
 * 对话编排器
 * 实现主循环：请求 → 解析 → 工具执行 → 重复/完成
 */
export class ConversationOrchestrator {
  private phase: OrchestratorPhase = 'idle'
  private readonly transport: UnifiedChatTransport
  private readonly parser: ChunkParser
  private readonly segmentBuilder: SegmentBuilder
  private readonly toolExecutor: ParallelToolExecutor
  private readonly stateManager: MessageManager
  private readonly callbacks?: OrchestratorCallbacks

  // 流式状态
  private streamingState: StreamingState

  constructor(
    private readonly context: PreparedRequest,
    config: OrchestratorConfig = {},
    callbacks?: OrchestratorCallbacks
  ) {
    // 初始化各层组件
    this.transport = new UnifiedChatTransport(
      () => { }, // beforeFetch (由外部处理)
      () => { }  // afterFetch (由外部处理)
    )
    this.parser = new ChunkParser()
    this.segmentBuilder = new SegmentBuilder()
    this.toolExecutor = new ParallelToolExecutor(config)
    this.callbacks = callbacks

    // 初始化状态管理器
    this.stateManager = new MessageManager(
      context.session.messageEntities,
      context.request.messages,
      // setMessages 由外部传入，这里暂时不用
      () => { }
    )

    // 初始化流式状态
    this.streamingState = this.createInitialStreamingState()
  }

  /**
   * 启动对话编排
   */
  async start(): Promise<StreamingContext> {
    let currentRequest = this.context

    // 主循环
    while (true) {
      // 1. 发起请求
      this.transition('streaming')
      await this.runSingleRequest(currentRequest)

      // 2. 检查工具调用
      if (
        !this.streamingState.tools.hasToolCall ||
        this.streamingState.tools.toolCalls.length === 0
      ) {
        break
      }

      // 3. 执行工具
      this.transition('toolExecuting')
      await this.executeTools()

      // 4. 构建下一次请求
      currentRequest = this.buildNextRequest(currentRequest)
    }

    // 完成
    this.transition('completed')
    return this.buildStreamingContext(currentRequest)
  }

  /**
   * 执行单个请求
   */
  private async runSingleRequest(requestContext: PreparedRequest): Promise<void> {
    try {
      // 使用已有的传输层实例
      const stream = this.transport.request(
        requestContext.request,
        requestContext.control.signal
      )

      // 解析流式响应
      for await (const chunk of stream) {
        // 检查是否被中断
        if (requestContext.control.signal.aborted) {
          throw new Error('Request aborted')
        }

        // 解析 chunk
        const parsed = this.parser.parse(chunk, this.streamingState)

        // 更新流式状态
        this.streamingState.isContentHasThinkTag = parsed.hasThinkTag
        this.streamingState.tools.toolCalls = parsed.toolCalls
        this.streamingState.tools.hasToolCall = parsed.toolCalls.length > 0

        // 应用解析结果到消息
        this.applyParseResult(parsed)
      }
    } catch (error) {
      // 错误处理
      if ((error as Error).name === 'AbortError') {
        throw error
      }
      console.error('Request error:', error)
      throw error
    }
  }

  /**
   * 执行工具调用
   */
  private async executeTools(): Promise<void> {
    const toolRuntime = this.streamingState.tools

    // 使用并行执行器
    const results = await this.toolExecutor.execute(toolRuntime.toolCalls)

    // 处理每个工具的结果
    for (const result of results) {
      this.addToolResultToMessage(result)

      // 添加工具响应消息到请求历史
      const toolCall = toolRuntime.toolCalls.find(tc => tc.function === result.name)
      if (toolCall) {
        this.stateManager.appendToolResponseMessage(
          result.name,
          toolCall.id || `call_${uuidv4()}`,
          this.formatToolResult(result.name, result.content)
        )
      }
    }

    // 清空工具调用列表
    toolRuntime.toolCalls = []
    toolRuntime.hasToolCall = false
  }

  /**
   * 应用解析结果到消息
   */
  private applyParseResult(parsed: ParseResult): void {
    this.stateManager.updateLastMessage(message => {
      const body = message.body
      let segments = body.segments || []

      // 应用 reasoning delta
      if (parsed.reasoningDelta) {
        segments = this.segmentBuilder.appendSegment(
          segments,
          parsed.reasoningDelta,
          'reasoning'
        )
      }

      // 应用 content delta
      if (parsed.contentDelta) {
        segments = this.segmentBuilder.appendSegment(
          segments,
          parsed.contentDelta,
          'text'
        )
      }

      // 累积内容
      if (parsed.contentDelta) {
        this.streamingState.gatherContent += parsed.contentDelta
      }
      if (parsed.reasoningDelta) {
        this.streamingState.gatherReasoning += parsed.reasoningDelta
      }

      return {
        ...message,
        body: {
          ...body,
          segments
        }
      }
    })
  }

  /**
   * 添加工具结果到消息
   */
  private addToolResultToMessage(result: ToolExecutionResult): void {
    this.stateManager.updateLastMessage(message => {
      const body = message.body
      const segments = body.segments || []

      segments.push({
        type: 'toolCall',
        name: result.name,
        content: result.content,
        cost: result.cost,
        isError: !!result.error,
        timestamp: Date.now()
      })

      return {
        ...message,
        body: {
          ...body,
          segments
        }
      }
    })
  }

  /**
   * 构建下一次请求
   */
  private buildNextRequest(
    currentContext: PreparedRequest
  ): PreparedRequest {
    // 创建 assistant tool call 消息
    const toolCalls = this.streamingState.tools.toolCalls.map(tc => ({
      id: tc.id || `call_${uuidv4()}`,
      type: 'function' as const,
      function: {
        name: tc.function,
        arguments: tc.args
      }
    }))

    this.stateManager.appendToolCallMessage(
      toolCalls,
      this.streamingState.gatherContent
    )

    // 返回更新后的上下文
    return {
      ...currentContext,
      request: {
        ...currentContext.request,
        messages: [...this.stateManager.requestMessages]
      }
    }
  }

  /**
   * 构建最终的 StreamingContext
   */
  private buildStreamingContext(
    requestContext: PreparedRequest
  ): StreamingContext {
    return {
      ...requestContext,
      streaming: this.streamingState
    }
  }

  /**
   * 状态转换
   */
  private transition(phase: OrchestratorPhase): void {
    if (this.phase === phase) return

    this.phase = phase

    // 通知回调
    if (phase === 'streaming') {
      this.callbacks?.onStateChange?.('streaming')
    } else if (phase === 'toolExecuting') {
      this.callbacks?.onStateChange?.('toolCall')
    } else if (phase === 'completed') {
      // 完成状态，不需要通知
    }
  }

  /**
   * 创建初始流式状态
   */
  private createInitialStreamingState(): StreamingState {
    return {
      gatherContent: '',
      gatherReasoning: '',
      isContentHasThinkTag: false,
      tools: {
        hasToolCall: false,
        toolCalls: [],
        toolCallResults: []
      }
    }
  }

  /**
   * 格式化工具结果
   */
  private formatToolResult(functionName: string, result: any): string {
    return functionName === 'web_search'
      ? formatWebSearchForLLM(result)
      : JSON.stringify({ ...result, functionCallCompleted: true })
  }
}
