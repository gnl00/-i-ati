import { withToolCallReasonParameters } from '@shared/tools/definitions-utils'
import { BaseAdapter } from '../base'

type ResponseInputText = {
  type: 'input_text'
  text: string
}

type ResponseInputImage = {
  type: 'input_image'
  image_url: string
  detail?: 'auto' | 'low' | 'high'
}

type ResponseMessageInput = {
  type: 'message'
  role: 'user' | 'assistant' | 'developer' | 'system'
  content: Array<ResponseInputText | ResponseInputImage>
}

type ResponseFunctionCallInput = {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

type ResponseFunctionCallOutputInput = {
  type: 'function_call_output'
  call_id: string
  output: string
}

type ResponseInputItem =
  | ResponseMessageInput
  | ResponseFunctionCallInput
  | ResponseFunctionCallOutputInput

const THINKING_LEVELS: ThinkingLevel[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']

const extractTextContent = (content: UnifiedRequestMessageContent): string => {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter(part => part?.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('\n')
  }

  return ''
}

const toResponseContent = (
  content: UnifiedRequestMessageContent
): Array<ResponseInputText | ResponseInputImage> => {
  if (typeof content === 'string') {
    return content ? [{ type: 'input_text', text: content }] : []
  }

  if (!Array.isArray(content)) {
    return []
  }

  return content.reduce<Array<ResponseInputText | ResponseInputImage>>((result, part) => {
    if (part.type === 'text' && typeof part.text === 'string') {
      result.push({ type: 'input_text', text: part.text })
      return result
    }

    if (part.type === 'image_url' && part.image_url?.url) {
      result.push({
        type: 'input_image',
        image_url: part.image_url.url,
        detail: part.image_url.detail
      })
    }

    return result
  }, [])
}

const stringifyToolOutput = (content: UnifiedRequestMessageContent): string => {
  if (typeof content === 'string') {
    return content
  }

  try {
    return JSON.stringify(content)
  } catch {
    return ''
  }
}

const transformMessages = (
  messages: UnifiedRequestMessage[],
  systemPrompt?: string
): {
  instructions?: string
  input: ResponseInputItem[]
} => {
  const instructionParts: string[] = []
  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    instructionParts.push(systemPrompt.trim())
  }
  const input: ResponseInputItem[] = []

  for (const message of messages) {
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.toolCallId || message.toolName || 'tool_call',
        output: stringifyToolOutput(message.content)
      })
      continue
    }

    if (message.role === 'system') {
      const systemText = extractTextContent(message.content).trim()
      if (systemText) {
        instructionParts.push(systemText)
      }
      continue
    }

    const responseContent = toResponseContent(message.content)
    if (responseContent.length > 0) {
      input.push({
        type: 'message',
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: responseContent
      })
    }

    if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      for (const toolCall of message.toolCalls) {
        input.push({
          type: 'function_call',
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments || '{}'
        })
      }
    }
  }

  return {
    instructions: instructionParts.length > 0 ? instructionParts.join('\n\n') : undefined,
    input
  }
}

const transformTools = (tools: any[] | undefined): any[] | undefined => {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined
  }

  return tools.map((tool) => {
    if (tool?.type === 'function' && tool.function) {
      return {
        type: 'function',
        name: tool.function.name,
        description: tool.function.description,
        parameters: withToolCallReasonParameters(
          tool.function.parameters || tool.function.inputSchema || { type: 'object', properties: {} }
        )
      }
    }

    return {
      type: 'function',
      name: tool.name || 'tool',
      description: tool.description,
      parameters: withToolCallReasonParameters(
        tool.inputSchema || tool.parameters || { type: 'object', properties: {} }
      )
    }
  })
}

const extractOutputText = (raw: any): string => {
  if (typeof raw?.output_text === 'string') {
    return raw.output_text
  }

  if (!Array.isArray(raw?.output)) {
    return ''
  }

  return raw.output
    .filter((item: any) => item?.type === 'message' && Array.isArray(item.content))
    .flatMap((item: any) => item.content)
    .filter((part: any) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part: any) => part.text)
    .join('')
}

const extractReasoning = (raw: any): string | undefined => {
  if (!Array.isArray(raw?.output)) {
    return undefined
  }

  const reasoningText = raw.output
    .filter((item: any) => item?.type === 'reasoning')
    .flatMap((item: any) => Array.isArray(item.summary) ? item.summary : item.content ?? [])
    .filter((part: any) =>
      (part?.type === 'summary_text' || part?.type === 'reasoning_text') && typeof part.text === 'string'
    )
    .map((part: any) => part.text)
    .join('\n')

  return reasoningText || undefined
}

const extractToolCalls = (raw: any): IToolCall[] | undefined => {
  if (!Array.isArray(raw?.output)) {
    return undefined
  }

  const toolCalls = raw.output
    .filter((item: any) => item?.type === 'function_call')
    .map((item: any, index: number) => ({
      id: item.call_id || item.id || `function_call_${index}`,
      index,
      type: 'function' as const,
      function: {
        name: item.name || '',
        arguments: typeof item.arguments === 'string'
          ? item.arguments
          : JSON.stringify(item.arguments ?? {})
      }
    }))

  return toolCalls.length > 0 ? toolCalls : undefined
}

const extractUsage = (raw: any): ITokenUsage | undefined => {
  const usage = raw?.usage
  if (!usage) {
    return undefined
  }

  const promptTokens = usage.input_tokens
  const completionTokens = usage.output_tokens
  const totalTokens = usage.total_tokens
  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    typeof totalTokens !== 'number'
  ) {
    return undefined
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens
  }
}

const mapResponsesFinishReason = (raw: any): IUnifiedResponse['finishReason'] => {
  const toolCalls = extractToolCalls(raw)
  if (toolCalls && toolCalls.length > 0) {
    return 'tool_calls'
  }

  const incompleteReason = raw?.incomplete_details?.reason
  if (incompleteReason === 'max_output_tokens') {
    return 'length'
  }
  if (incompleteReason === 'content_filter') {
    return 'content_filter'
  }

  return 'stop'
}

export class OpenAIResponsesAdapter extends BaseAdapter {
  providerType: ProviderType = 'openai-response'
  private currentModel = 'unknown'

  buildHeaders(req: IUnifiedRequest): Record<string, string> {
    this.currentModel = req.model || this.currentModel
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${req.apiKey}`
    }
  }

  supportsStreamOptionsUsage(): boolean {
    return false
  }

  getThinkingLevels(): ThinkingLevel[] {
    return THINKING_LEVELS
  }

  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/responses`
  }

  buildRequest(req: IUnifiedRequest): any {
    this.currentModel = req.model || this.currentModel
    const { instructions, input } = transformMessages(req.messages, req.systemPrompt)
    const requestBody: Record<string, unknown> = {
      model: req.model,
      input,
      stream: req.stream ?? true,
      text: {
        format: {
          type: 'text'
        }
      }
    }

    if (instructions) {
      requestBody.instructions = instructions
    }

    if (req.options?.maxTokens !== undefined) {
      requestBody.max_output_tokens = req.options.maxTokens
    }

    const thinking = req.options?.thinking
    if (
      thinking?.enabled === true &&
      thinking.effort &&
      THINKING_LEVELS.includes(thinking.effort)
    ) {
      requestBody.reasoning = {
        effort: thinking.effort
      }
    }

    const tools = transformTools(req.tools)
    if (tools) {
      requestBody.tools = tools
      requestBody.tool_choice = 'auto'
    }

    return requestBody
  }

  parseResponse(response: any): IUnifiedResponse {
    return {
      id: response?.id || 'response',
      model: response?.model || this.currentModel,
      timestamp: response?.created_at ? response.created_at * 1000 : Date.now(),
      content: extractOutputText(response),
      reasoning: extractReasoning(response),
      toolCalls: extractToolCalls(response),
      finishReason: mapResponsesFinishReason(response),
      usage: extractUsage(response),
      raw: response
    }
  }

  parseStreamResponse(chunk: string): IUnifiedStreamResponse | null {
    try {
      if (!chunk.startsWith('data: ')) {
        return null
      }

      const payloadText = chunk.slice(6).trim()
      if (!payloadText || payloadText === '[DONE]') {
        return null
      }

      const payload = JSON.parse(payloadText)

      if (payload.type === 'response.output_text.delta') {
        return {
          id: payload.item_id || 'response-stream',
          model: payload.response?.model || this.currentModel,
          delta: {
            content: typeof payload.delta === 'string' ? payload.delta : undefined
          },
          raw: payload
        }
      }

      if (payload.type === 'response.output_item.done' && payload.item?.type === 'function_call') {
        return {
          id: payload.item.call_id || payload.item.id || 'response-stream',
          model: payload.response?.model || this.currentModel,
          delta: {
            toolCalls: [{
              id: payload.item.call_id || payload.item.id || 'function_call',
              type: 'function',
              function: {
                name: payload.item.name || '',
                arguments: typeof payload.item.arguments === 'string'
                  ? payload.item.arguments
                  : JSON.stringify(payload.item.arguments ?? {})
              }
            }],
            finishReason: 'tool_calls'
          },
          raw: payload
        }
      }

      if (payload.type === 'response.completed' && payload.response) {
        return {
          id: payload.response.id || 'response-stream',
          model: payload.response.model || this.currentModel,
          delta: {
            finishReason: mapResponsesFinishReason(payload.response)
          },
          usage: extractUsage(payload.response),
          raw: payload
        }
      }
    } catch (error) {
      console.warn('Failed to parse OpenAI Responses stream chunk:', error)
    }

    return null
  }
}
