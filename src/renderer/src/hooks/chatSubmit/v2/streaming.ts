import { invokeMcpToolCall } from '@renderer/invoker/ipcInvoker'
import { unifiedChatRequest } from '@request/index'
import { embeddedToolsRegistry } from '@tools/index'
import { v4 as uuidv4 } from 'uuid'
import type {
  PreparedRequest,
  SendRequestStage,
  StreamingContext,
  StreamingDeps,
  StreamingFactoryCallbacks,
  StreamingState
} from './types'
import { formatWebSearchForLLM, normalizeToolArgs } from './utils'
import { AbortError } from './errors'
import { ChunkParser, SegmentBuilder } from './streaming/parser'
import type { ParseResult } from './streaming/parser/types'
import { MessageManager } from './streaming/message-manager'

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

    while (toolRuntime.toolCalls.length > 0) {
      if (this.context.control.signal.aborted) {
        throw new AbortError()
      }

      const toolCall = (toolRuntime.toolCalls.shift())!
      const startTime = new Date().getTime()
      try {
        let results: any

        if (embeddedToolsRegistry.isRegistered(toolCall.function)) {
          const args = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : toolCall.args
          const normalizedArgs = normalizeToolArgs(args)
          results = await embeddedToolsRegistry.execute(toolCall.function, normalizedArgs)
        } else {
          results = await invokeMcpToolCall({
            callId: 'call_' + uuidv4(),
            tool: toolCall.function,
            args: toolCall.args
          })
        }

        const timeCosts = new Date().getTime() - startTime

        const toolFunctionMessage: ChatMessage = {
          role: 'tool',
          name: toolCall.function,
          toolCallId: toolCall.id || `call_${uuidv4()}`,
          content: handleToolCallResult(toolCall.function, results),
          segments: []
        }
        if (!toolRuntime.toolCallResults) {
          toolRuntime.toolCallResults = [{
            name: toolCall.function,
            content: results,
            cost: timeCosts
          }]
        } else {
          toolRuntime.toolCallResults.push({
            name: toolCall.function,
            content: results,
            cost: timeCosts
          })
        }

        const messageManager = new MessageManager(this.context, this.deps.setMessages)

        // 添加 toolCall segment
        messageManager.appendSegmentToLastMessage({
          type: 'toolCall',
          name: toolCall.function,
          content: results,
          cost: timeCosts,
          timestamp: Date.now()
        })

        // 添加 tool result 消息
        messageManager.addToolResultMessage(toolFunctionMessage)
      } catch (error: any) {
        console.error('Tool call error:', error)
        const messageManager = new MessageManager(this.context, this.deps.setMessages)

        messageManager.updateLastMessage(msg => ({
          body: {
            ...msg.body,
            role: 'assistant',
            content: this.context.streaming.gatherContent,
            model: this.context.meta.model.name
          }
        }))
      }
    }

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
