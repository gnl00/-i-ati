import { withToolCallReasonParameters } from '@shared/tools/definitions-utils'
import { BaseAdapter } from '../base'
import { inferImageMimeTypeFromUrl, parseDataImageUrl } from '../multimodal'

const THINKING_LEVELS: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high']

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

const createTextPart = (text: string): { text: string } => ({ text })

const createImagePart = (url: string): Record<string, unknown> | undefined => {
  const imageUrl = url.trim()
  if (!imageUrl) {
    return undefined
  }

  const dataImage = parseDataImageUrl(imageUrl)
  if (dataImage) {
    return {
      inlineData: {
        mimeType: dataImage.mediaType,
        data: dataImage.data
      }
    }
  }

  const mimeType = inferImageMimeTypeFromUrl(imageUrl)
  return {
    fileData: {
      ...(mimeType ? { mimeType } : {}),
      fileUri: imageUrl
    }
  }
}

const toGeminiContentParts = (content: UnifiedRequestMessageContent): Array<Record<string, unknown>> => {
  if (typeof content === 'string') {
    return content ? [createTextPart(content)] : []
  }

  if (!Array.isArray(content)) {
    return []
  }

  return content.flatMap((part): Array<Record<string, unknown>> => {
    if (typeof part === 'string') {
      return part ? [createTextPart(part)] : []
    }

    if (part?.type === 'text' && typeof part.text === 'string') {
      return part.text ? [createTextPart(part.text)] : []
    }

    if (part?.type === 'image_url' && part.image_url?.url) {
      const imagePart = createImagePart(part.image_url.url)
      return imagePart ? [imagePart] : []
    }

    return []
  })
}

const safeParseJson = (value: string | undefined): Record<string, unknown> => {
  if (!value || typeof value !== 'string') {
    return {}
  }

  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return { raw: value }
  }
}

const toGeminiRole = (role: UnifiedRequestMessageRole): 'user' | 'model' => {
  return role === 'assistant' ? 'model' : 'user'
}

const normalizeModelName = (model: string): string => {
  if (!model) {
    return 'models/gemini-2.5-flash'
  }
  return model.startsWith('models/') ? model : `models/${model}`
}

const mapGeminiFinishReason = (reason: unknown): IUnifiedResponse['finishReason'] => {
  switch (String(reason || '').toUpperCase()) {
    case 'STOP':
      return 'stop'
    case 'MAX_TOKENS':
      return 'length'
    case 'SAFETY':
      return 'content_filter'
    case 'FUNCTION_CALL':
      return 'tool_calls'
    default:
      return 'stop'
  }
}

const extractUsage = (raw: any): ITokenUsage | undefined => {
  const usage = raw?.usageMetadata
  if (!usage) {
    return undefined
  }

  const promptTokens = usage.promptTokenCount
  const completionTokens = usage.candidatesTokenCount
  const totalTokens = usage.totalTokenCount
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

const transformToolDefinitions = (tools: any[] | undefined): any[] | undefined => {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined
  }

  return [{
    functionDeclarations: tools.map((tool) => {
      if (tool?.type === 'function' && tool?.function) {
        return {
          name: tool.function.name,
          description: tool.function.description,
          parameters: withToolCallReasonParameters(
            tool.function.parameters || tool.function.inputSchema || { type: 'object', properties: {} }
          )
        }
      }

      return {
        name: tool.name || 'tool',
        description: tool.description,
        parameters: withToolCallReasonParameters(
          tool.inputSchema || tool.parameters || { type: 'object', properties: {} }
        )
      }
    })
  }]
}

const transformMessages = (messages: UnifiedRequestMessage[], systemPrompt?: string) => {
  const systemParts: Array<{ text: string }> = []
  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    systemParts.push(createTextPart(systemPrompt.trim()))
  }
  const contents: Array<Record<string, unknown>> = []

  for (const message of messages || []) {
    if (message.role === 'system') {
      const systemText = extractTextContent(message.content).trim()
      if (systemText) {
        systemParts.push(createTextPart(systemText))
      }
      continue
    }

    if (message.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: message.toolName || message.toolCallId || 'tool',
            response: safeParseJson(
              typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content)
            )
          }
        }]
      })
      continue
    }

    const parts = toGeminiContentParts(message.content)

    if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      for (const toolCall of message.toolCalls) {
        parts.push({
          functionCall: {
            name: toolCall.function?.name || '',
            args: safeParseJson(toolCall.function?.arguments || '{}')
          }
        })
      }
    }

    if (parts.length > 0) {
      contents.push({
        role: toGeminiRole(message.role),
        parts
      })
    }
  }

  return {
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
    contents
  }
}

const extractTextFromParts = (parts: any[]): string => {
  if (!Array.isArray(parts)) {
    return ''
  }

  return parts
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('')
}

const extractToolCallsFromParts = (parts: any[]): IToolCall[] | undefined => {
  if (!Array.isArray(parts)) {
    return undefined
  }

  const toolCalls = parts
    .filter(part => part?.functionCall && typeof part.functionCall.name === 'string')
    .map((part, index) => ({
      id: `gemini_tool_${Date.now()}_${index}`,
      index,
      type: 'function' as const,
      function: {
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args || {})
      }
    }))

  return toolCalls.length > 0 ? toolCalls : undefined
}

const extractPayload = (raw: unknown): any => Array.isArray(raw) ? raw[0] : raw

export class GeminiAdapter extends BaseAdapter {
  providerType: ProviderType = 'gemini'
  private currentModel = 'gemini'

  buildHeaders(req: IUnifiedRequest): Record<string, string> {
    this.currentModel = req.model || this.currentModel
    return {
      'content-type': 'application/json',
      'x-goog-api-key': req.apiKey
    }
  }

  supportsStreamOptionsUsage(): boolean {
    return false
  }

  getThinkingLevels(): ThinkingLevel[] {
    return THINKING_LEVELS
  }

  getEndpoint(baseUrl: string, req?: IUnifiedRequest): string {
    if (req?.model) {
      this.currentModel = req.model
    }
    const modelName = normalizeModelName(req?.model ?? '')
    return req?.stream === false
      ? `${baseUrl}/${modelName}:generateContent`
      : `${baseUrl}/${modelName}:streamGenerateContent?alt=sse`
  }

  buildRequest(req: IUnifiedRequest): any {
    this.currentModel = req.model || this.currentModel
    const { systemInstruction, contents } = transformMessages(req.messages, req.systemPrompt)
    const generationConfig: Record<string, unknown> = {}

    if (req.options?.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = req.options.maxTokens
    }

    const thinking = req.options?.thinking
    if (
      thinking?.enabled === true &&
      thinking.effort &&
      THINKING_LEVELS.includes(thinking.effort)
    ) {
      generationConfig.thinkingConfig = { thinkingLevel: thinking.effort }
    }

    const requestBody: Record<string, unknown> = {
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {})
    }

    const tools = transformToolDefinitions(req.tools)
    if (tools) {
      requestBody.tools = tools
    }

    return requestBody
  }

  parseResponse(response: any): IUnifiedResponse {
    const payload = extractPayload(response)
    const candidate = payload?.candidates?.[0]
    const parts = candidate?.content?.parts || []

    return {
      id: payload?.responseId || 'gemini-response',
      model: payload?.modelVersion || this.currentModel,
      timestamp: Date.now(),
      content: extractTextFromParts(parts),
      toolCalls: extractToolCallsFromParts(parts),
      finishReason: mapGeminiFinishReason(candidate?.finishReason),
      usage: extractUsage(payload),
      raw: payload
    }
  }

  parseStreamResponse(chunk: string): IUnifiedStreamResponse | null {
    try {
      if (!chunk.startsWith('data: ')) {
        return null
      }

      const payloadText = chunk.slice(6).trim()
      if (!payloadText) {
        return null
      }

      const payload = extractPayload(JSON.parse(payloadText))
      const candidate = payload?.candidates?.[0]
      const parts = candidate?.content?.parts || []

      return {
        id: payload?.responseId || 'gemini-stream',
        model: payload?.modelVersion || this.currentModel,
        delta: {
          content: extractTextFromParts(parts) || undefined,
          toolCalls: extractToolCallsFromParts(parts),
          finishReason: candidate?.finishReason ? mapGeminiFinishReason(candidate.finishReason) : undefined
        },
        usage: extractUsage(payload),
        raw: payload
      }
    } catch (error) {
      console.warn('Failed to parse Gemini stream chunk:', error)
      return null
    }
  }
}
