import { unifiedChatRequest } from '@request/index'
import { v4 as uuidv4 } from 'uuid'
import type {
  PreparedRequest,
  SendRequestStage,
  StreamingContext,
  StreamingDeps,
  StreamingFactoryCallbacks,
  StreamingState
} from './types'
import { formatWebSearchForLLM } from './utils'
import { AbortError } from './errors'
import { ChunkParser, SegmentBuilder } from './streaming/parser'
import type { ParseResult } from './streaming/parser/types'
import { MessageManager } from './streaming/message-manager'
import { ToolExecutor } from './streaming/executor'
import type { ToolExecutionProgress } from './streaming/executor/types'

const handleToolCallResult = (functionName: string, results: any) => {
  return functionName === 'web_search'
    ? formatWebSearchForLLM(results)
    : JSON.stringify({ ...results, functionCallCompleted: true })
}

const createInitialStreamingState = (): StreamingState => ({
  gatherContent: '',
  gatherReasoning: '',
  isContentHasThinkTag: false,
  tools: {
    hasToolCall: false,
    toolCalls: [],
    toolCallResults: []
  }
})

/**
 * 应用解析结果到消息
 * @param context 流式上下文
 * @param result 解析结果
 * @param setMessages 设置消息函数
 */
const applyParseResult = (
  context: StreamingContext,
  result: ParseResult,
  setMessages: (messages: MessageEntity[]) => void
) => {
  const messageManager = new MessageManager(context, setMessages)
  const segmentBuilder = new SegmentBuilder()

  const lastMessage = messageManager.getLastMessage()

  if (!lastMessage.body.segments) {
    messageManager.updateLastMessage(msg => {
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

  // 原子更新（自动完成 3 次同步）
  messageManager.updateLastMessage(msg => ({
    ...msg,
    body: {
      ...msg.body,
      segments
    }
  }))
}

/**
 * 处理流式响应 chunk
 * @param context 流式上下文
 * @param resp 响应 chunk
 * @param setMessages 设置消息函数
 * @param parser ChunkParser 实例
 */
const handleStreamingChunk = (
  context: StreamingContext,
  resp: IUnifiedResponse,
  setMessages: (messages: MessageEntity[]) => void,
  parser: ChunkParser
) => {
  // 1. 使用 Parser 解析 chunk
  const result = parser.parse(resp, context.streaming)

  // 2. 更新流式状态
  context.streaming.tools.toolCalls = result.toolCalls
  context.streaming.tools.hasToolCall = result.toolCalls.length > 0
  context.streaming.isContentHasThinkTag = result.isInThinkTag

  // 3. 更新 gatherContent 和 gatherReasoning（用于向后兼容）
  if (result.contentDelta) {
    context.streaming.gatherContent += result.contentDelta
  }
  if (result.reasoningDelta) {
    context.streaming.gatherReasoning += result.reasoningDelta
  }

  // 4. 应用解析结果
  applyParseResult(context, result, setMessages)
}

type StreamingPhase = 'idle' | 'receiving' | 'toolCall' | 'completed'

class StreamingSessionMachine {
  private readonly context: StreamingContext
  private phase: StreamingPhase = 'idle'
  private readonly parser = new ChunkParser()

  constructor(
    requestReady: PreparedRequest,
    private readonly deps: StreamingDeps,
    private readonly callbacks?: StreamingFactoryCallbacks
  ) {
    this.context = {
      ...requestReady,
      streaming: createInitialStreamingState()
    }
  }

  private transition(phase: StreamingPhase) {
    if (this.phase === phase) return
    this.phase = phase
    if (phase === 'receiving') {
      this.callbacks?.onStateChange('streaming')
    } else if (phase === 'toolCall') {
      this.callbacks?.onStateChange('toolCall')
    } else if (phase === 'completed') {
      this.deps.setShowLoadingIndicator(false)
    }
  }

  private async runSingleRequest() {
    this.transition('receiving')
    const response = await unifiedChatRequest(
      this.context.request as IUnifiedRequest,
      this.context.control.signal,
      this.deps.beforeFetch,
      this.deps.afterFetch
    )

    if (this.context.request.stream === false) {
      this.applyNonStreamingResponse(response as IUnifiedResponse)
      return
    }

    for await (const chunk of response as AsyncIterable<IUnifiedResponse>) {
      if (this.context.control.signal.aborted) {
        throw new AbortError()
      }
      handleStreamingChunk(this.context, chunk, this.deps.setMessages, this.parser)
    }

    this.flushToolCallPlaceholder()
  }

  private applyNonStreamingResponse(resp: IUnifiedResponse) {
    const messageManager = new MessageManager(this.context, this.deps.setMessages)

    messageManager.updateLastMessage(() => ({
      body: {
        role: 'assistant',
        model: this.context.meta.model.name,
        content: resp.content,
        segments: [{
          type: 'text',
          content: resp.content,
          timestamp: Date.now()
        }]
      }
    }))
  }

  private flushToolCallPlaceholder() {
    if (!this.context.streaming.tools.hasToolCall || this.context.streaming.tools.toolCalls.length === 0) {
      return
    }

    const messageManager = new MessageManager(this.context, this.deps.setMessages)
    const lastMessage = messageManager.getLastMessage()

    const assistantToolCallMessage: ChatMessage = {
      role: 'assistant',
      content: this.context.streaming.gatherContent || '',
      segments: [],
      toolCalls: this.context.streaming.tools.toolCalls.map(tc => ({
        id: tc.id || `call_${uuidv4()}`,
        type: 'function',
        function: {
          name: tc.function,
          arguments: tc.args
        }
      }))
    }

    this.context.request.messages.push(assistantToolCallMessage)

    messageManager.updateLastMessage(() => ({
      body: {
        role: 'assistant',
        content: this.context.streaming.gatherContent || '',
        model: this.context.meta.model.name,
        segments: lastMessage.body.segments,
        toolCalls: assistantToolCallMessage.toolCalls
      }
    }))
  }

  private async handleToolCalls() {
    const toolRuntime = this.context.streaming.tools

    if (toolRuntime.toolCalls.length === 0) {
      return
    }

    // 创建 ToolExecutor 实例
    const executor = new ToolExecutor({
      maxConcurrency: 3,
      signal: this.context.control.signal,
      onProgress: (progress: ToolExecutionProgress) => {
        // 实时 UI 更新
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

    // 处理结果并更新消息
    const messageManager = new MessageManager(this.context, this.deps.setMessages)

    for (const result of results) {
      if (result.status === 'success') {
        // 成功：添加工具结果
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
        messageManager.appendSegmentToLastMessage({
          type: 'toolCall',
          name: result.name,
          content: result.content,
          cost: result.cost,
          timestamp: Date.now()
        })

        // 添加 tool result 消息
        messageManager.addToolResultMessage(toolFunctionMessage)
      } else {
        // 失败：记录错误并添加错误 segment
        console.error(`[Tool] Execution failed:`, {
          name: result.name,
          status: result.status,
          error: result.error,
          cost: result.cost
        })

        // 添加错误 segment 用于 UI 显示
        messageManager.appendSegmentToLastMessage({
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

    // 清理
    toolRuntime.toolCalls = []
    toolRuntime.hasToolCall = false
  }

  async start(): Promise<StreamingContext> {
    while (true) {
      await this.runSingleRequest()

      if (this.context.streaming.tools.hasToolCall && this.context.streaming.tools.toolCalls.length > 0) {
        this.transition('toolCall')
        await this.handleToolCalls()
      } else {
        break
      }
    }

    this.transition('completed')
    return this.context
  }
}

export const createStreamingV2 = (deps: StreamingDeps): SendRequestStage => {
  const sendRequest: SendRequestStage = async (requestReady, callbacks) => {
    const machine = new StreamingSessionMachine(requestReady, deps, callbacks)
    return machine.start()
  }

  return sendRequest
}
