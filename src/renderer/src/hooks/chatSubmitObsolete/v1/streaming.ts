import { invokeMcpToolCall } from '@renderer/invoker/ipcInvoker'
import { useChatStore } from '@renderer/store'
import { unifiedChatRequest } from '@request/index'
import { embeddedToolsRegistry } from '@tools/index'
import { v4 as uuidv4 } from 'uuid'
import { formatWebSearchForLLM, normalizeToolArgs } from './utils'
import { RequestReadyChat, StreamingContext, StreamingDeps, StreamingState } from './types'

interface StreamingFactoryParams extends StreamingDeps {
  beforeFetch: () => void
  afterFetch: () => void
  onStateChange?: (state: 'streaming' | 'toolCall') => void
}

const handleToolCallResult = (functionName: string, results: any) => {
  return functionName === 'web_search'
    ? formatWebSearchForLLM(results)
    : JSON.stringify({ ...results, functionCallCompleted: true })
}

const createInitialStreamingState = (): StreamingState => ({
  gatherContent: '',
  gatherReasoning: '',
  isContentHasThinkTag: false,
  previousTextLength: 0,
  previousReasoningLength: 0,
  tools: {
    hasToolCall: false,
    toolCalls: [],
    toolCallResults: []
  }
})

export const createStreamingPipeline = ({
  setMessages,
  setShowLoadingIndicator,
  artifacts,
  beforeFetch,
  afterFetch,
  onStateChange
}: StreamingFactoryParams) => {
  const processRequest = async (context: StreamingContext): Promise<StreamingContext> => {
    const response = await unifiedChatRequest(context.request as IUnifiedRequest, context.control.signal, beforeFetch, afterFetch)

    if (false === context.request.stream) {
      const resp = response as IUnifiedResponse
      const updatedMessages = [...context.session.messageEntities]
      updatedMessages[updatedMessages.length - 1] = {
        body: {
          role: 'assistant',
          model: context.meta.model.name,
          content: resp.content,
          segments: [{
            type: 'text',
            content: resp.content,
            timestamp: Date.now()
          }]
        }
      }
      setMessages(updatedMessages)
      context.session.messageEntities = updatedMessages
      context.session.chatMessages = updatedMessages.map(msg => msg.body)
      return context
    }

    for await (const chunk of response) {
      if (context.control.signal.aborted) {
        throw new DOMException('Request aborted', 'AbortError')
      }

      const resp = chunk as IUnifiedResponse
      const toolRuntime = context.streaming.tools

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
        if (!context.streaming.gatherReasoning) {
          context.streaming.gatherReasoning = context.streaming.gatherContent
          context.streaming.gatherContent = ''
        }
        if (resp.content) {
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
          context.streaming.gatherContent += resp.content
        } else if (resp.reasoning) {
          context.streaming.gatherReasoning += resp.reasoning || ''
        }
      }

      const updatedMessages = [...context.session.messageEntities]
      const lastMessage = updatedMessages[updatedMessages.length - 1]

      if (!lastMessage.body.segments) {
        lastMessage.body.segments = []
      }

      const segments = [...lastMessage.body.segments]

      if (context.streaming.gatherReasoning.trim()) {
        const lastIndex = segments.length - 1
        const lastSegment = segments[lastIndex]

        const currentReasoning = context.streaming.gatherReasoning.trim()
        const previousLength = context.streaming.previousReasoningLength || 0
        const segmentReasoning = currentReasoning.slice(previousLength)

        if (segmentReasoning) {
          if (lastSegment && lastSegment.type === 'reasoning') {
            segments[lastIndex] = {
              ...lastSegment,
              content: (lastSegment.content || '') + segmentReasoning
            }
          } else {
            segments.push({
              type: 'reasoning',
              content: segmentReasoning,
              timestamp: Date.now()
            })
          }
          context.streaming.previousReasoningLength = currentReasoning.length
        }
      }

      if (context.streaming.gatherContent.trim()) {
        const lastIndex = segments.length - 1
        const lastSegment = segments[lastIndex]

        const currentText = context.streaming.gatherContent.trim()
        const previousLength = context.streaming.previousTextLength || 0
        const segmentContent = currentText.slice(previousLength)

        if (segmentContent) {
          if (lastSegment && lastSegment.type === 'text') {
            segments[lastIndex] = {
              ...lastSegment,
              content: (lastSegment.content || '') + segmentContent
            }
          } else {
            segments.push({
              type: 'text',
              content: segmentContent,
              timestamp: Date.now()
            })
          }
          context.streaming.previousTextLength = currentText.length
        }
      }

      lastMessage.body.segments = segments
      context.session.messageEntities = updatedMessages
      context.session.chatMessages = updatedMessages.map(msg => msg.body)
      setMessages(updatedMessages)
    }

    if (context.streaming.tools.hasToolCall && context.streaming.tools.toolCalls.length > 0) {
      const currentMessages = useChatStore.getState().messages
      const lastMessage = currentMessages[currentMessages.length - 1]

      const assistantToolCallMessage: ChatMessage = {
        role: 'assistant',
        content: context.streaming.gatherContent || '',
        segments: [],
        toolCalls: context.streaming.tools.toolCalls.map(tc => ({
          id: tc.id || `call_${uuidv4()}`,
          type: 'function',
          function: {
            name: tc.function,
            arguments: tc.args
          }
        }))
      }

      context.request.messages.push(assistantToolCallMessage)

      const lastIndex = context.session.messageEntities.length - 1
      context.session.messageEntities[lastIndex] = {
        body: {
          role: 'assistant',
          content: context.streaming.gatherContent || '',
          model: context.meta.model.name,
          segments: lastMessage.body.segments,
          toolCalls: assistantToolCallMessage.toolCalls
        }
      }
      context.session.chatMessages = context.session.messageEntities.map(msg => msg.body)
      setMessages([...context.session.messageEntities])
    }

    return context
  }

  const handleToolCall = async (context: StreamingContext): Promise<StreamingContext> => {
    const toolRuntime = context.streaming.tools

    while (toolRuntime.toolCalls.length > 0) {
      if (context.control.signal.aborted) {
        throw new DOMException('Request aborted', 'AbortError')
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

        const updatedMessages = [...context.session.messageEntities]
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
            artifacts: artifacts,
            model: context.meta.model.name
          }
        }
        setMessages(updatedMessages)
        context.session.messageEntities = updatedMessages
        context.session.chatMessages = updatedMessages.map(msg => msg.body)

        context.request.messages.push(toolFunctionMessage)
      } catch (error: any) {
        console.error('Tool call error:', error)
        const updatedMessages = [...context.session.messageEntities]
        const currentBody = updatedMessages[updatedMessages.length - 1].body
        updatedMessages[updatedMessages.length - 1] = {
          body: {
            ...currentBody,
            role: 'assistant',
            content: context.streaming.gatherContent,
            artifacts: artifacts,
            model: context.meta.model.name
          }
        }
        setMessages(updatedMessages)
        context.session.messageEntities = updatedMessages
        context.session.chatMessages = updatedMessages.map(msg => msg.body)
      }
    }

    toolRuntime.hasToolCall = false
    return context
  }

  const processRequestWithToolCall = async (context: StreamingContext): Promise<StreamingContext> => {
    onStateChange?.('streaming')
    context = await processRequest(context)

    if (context.streaming.tools.hasToolCall && context.streaming.tools.toolCalls.length > 0) {
      onStateChange?.('toolCall')
      context = await handleToolCall(context)
      return await processRequestWithToolCall(context)
    } else {
      setShowLoadingIndicator(false)
    }

    return context
  }

  const runPipeline = async (requestReady: RequestReadyChat): Promise<StreamingContext> => {
    const streamingContext: StreamingContext = {
      ...requestReady,
      streaming: createInitialStreamingState()
    }
    return processRequestWithToolCall(streamingContext)
  }

  return {
    runPipeline
  }
}
