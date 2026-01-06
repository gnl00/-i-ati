import { invokeMcpToolCall } from '@renderer/invoker/ipcInvoker'
import { useChatStore } from '@renderer/store'
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

const handleStreamingChunk = (
  context: StreamingContext,
  resp: IUnifiedResponse,
  setMessages: (messages: MessageEntity[]) => void
) => {
  const toolRuntime = context.streaming.tools
  let reasoningDelta = ''
  let textDelta = ''

  if (resp.toolCalls && resp.toolCalls.length > 0) {
    if (!toolRuntime.hasToolCall) toolRuntime.hasToolCall = true

    resp.toolCalls.forEach(tc => {
      const existingToolCall = toolRuntime.toolCalls.find(t =>
        (tc.index !== undefined && t.index === tc.index) ||
        (tc.id && t.id === tc.id)
      )

      if (existingToolCall) {
        if (tc.function.name) existingToolCall.function = tc.function.name
        if (tc.function.arguments) existingToolCall.args += tc.function.arguments
      } else {
        toolRuntime.toolCalls.push({
          id: tc.id,
          index: tc.index,
          function: tc.function.name || '',
          args: tc.function.arguments || ''
        })
      }
    })
  }

  if (context.streaming.isContentHasThinkTag) {
    if (!context.streaming.gatherReasoning && context.streaming.gatherContent) {
      reasoningDelta += context.streaming.gatherContent
      context.streaming.gatherReasoning = context.streaming.gatherContent
      context.streaming.gatherContent = ''
    }
    if (resp.content) {
      reasoningDelta += resp.content
      context.streaming.gatherReasoning += resp.content
    }
    if (context.streaming.gatherReasoning.includes('</think>')) {
      context.streaming.gatherReasoning = context.streaming.gatherReasoning.replace('</think>', '')
      context.streaming.isContentHasThinkTag = false
    }
  } else {
    if (context.streaming.gatherContent.includes('<think>')) {
      context.streaming.isContentHasThinkTag = true
      if (resp.content) {
        context.streaming.gatherContent = resp.content
      }
    } else if (resp.content) {
      textDelta += resp.content
      context.streaming.gatherContent += resp.content
    } else if (resp.reasoning) {
      reasoningDelta += resp.reasoning || ''
      context.streaming.gatherReasoning += resp.reasoning || ''
    }
  }

  const updatedMessages = [...context.session.messageEntities]
  const lastMessage = updatedMessages[updatedMessages.length - 1]

  if (!lastMessage.body.segments) {
    lastMessage.body.segments = []
  }

  const segments = [...lastMessage.body.segments]

  if (reasoningDelta.trim()) {
    const lastIndex = segments.length - 1
    const lastSegment = segments[lastIndex]
    const reasoningContent = reasoningDelta

    if (lastSegment && lastSegment.type === 'reasoning') {
      segments[lastIndex] = {
        ...lastSegment,
        content: (lastSegment.content || '') + reasoningContent
      }
    } else {
      segments.push({
        type: 'reasoning',
        content: reasoningContent,
        timestamp: Date.now()
      })
    }
  }

  if (textDelta.trim()) {
    const lastIndex = segments.length - 1
    const lastSegment = segments[lastIndex]
    const textContent = textDelta

    if (lastSegment && lastSegment.type === 'text') {
      segments[lastIndex] = {
        ...lastSegment,
        content: (lastSegment.content || '') + textContent
      }
    } else {
      segments.push({
        type: 'text',
        content: textContent,
        timestamp: Date.now()
      })
    }
  }

  lastMessage.body.segments = segments
  context.session.messageEntities = updatedMessages
  context.session.chatMessages = updatedMessages.map(msg => msg.body)
  setMessages(updatedMessages)
}

type StreamingPhase = 'idle' | 'receiving' | 'toolCall' | 'completed'

class StreamingSessionMachine {
  private readonly context: StreamingContext
  private phase: StreamingPhase = 'idle'

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
      handleStreamingChunk(this.context, chunk, this.deps.setMessages)
    }

    this.flushToolCallPlaceholder()
  }

  private applyNonStreamingResponse(resp: IUnifiedResponse) {
    const updatedMessages = [...this.context.session.messageEntities]
    updatedMessages[updatedMessages.length - 1] = {
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
    }
    this.deps.setMessages(updatedMessages)
    this.context.session.messageEntities = updatedMessages
    this.context.session.chatMessages = updatedMessages.map(msg => msg.body)
  }

  private flushToolCallPlaceholder() {
    if (!this.context.streaming.tools.hasToolCall || this.context.streaming.tools.toolCalls.length === 0) {
      return
    }

    const currentMessages = useChatStore.getState().messages
    const lastMessage = currentMessages[currentMessages.length - 1]

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

    const lastIndex = this.context.session.messageEntities.length - 1
    this.context.session.messageEntities[lastIndex] = {
      body: {
        role: 'assistant',
        content: this.context.streaming.gatherContent || '',
        model: this.context.meta.model.name,
        segments: lastMessage.body.segments,
        toolCalls: assistantToolCallMessage.toolCalls
      }
    }
    this.context.session.chatMessages = this.context.session.messageEntities.map(msg => msg.body)
    this.deps.setMessages([...this.context.session.messageEntities])
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

        const updatedMessages = [...this.context.session.messageEntities]
        const currentBody = updatedMessages[updatedMessages.length - 1].body

        if (!currentBody.segments) {
          currentBody.segments = []
        }

        currentBody.segments.push({
          type: 'toolCall',
          name: toolCall.function,
          content: results,
          cost: timeCosts,
          timestamp: Date.now()
        })

        updatedMessages[updatedMessages.length - 1] = {
          body: {
            ...currentBody,
            role: 'assistant',
            model: this.context.meta.model.name
          }
        }
        this.deps.setMessages(updatedMessages)
        this.context.session.messageEntities = updatedMessages
        this.context.session.chatMessages = updatedMessages.map(msg => msg.body)

        this.context.request.messages.push(toolFunctionMessage)
      } catch (error: any) {
        console.error('Tool call error:', error)
        const updatedMessages = [...this.context.session.messageEntities]
        const currentBody = updatedMessages[updatedMessages.length - 1].body
        updatedMessages[updatedMessages.length - 1] = {
          body: {
            ...currentBody,
            role: 'assistant',
            content: this.context.streaming.gatherContent,
            model: this.context.meta.model.name
          }
        }
        this.deps.setMessages(updatedMessages)
        this.context.session.messageEntities = updatedMessages
        this.context.session.chatMessages = updatedMessages.map(msg => msg.body)
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
