/**
 * RequestMaterializer
 *
 * 放置内容：
 * - 把 AgentTranscript 物化成协议层请求结果
 * - 负责把 `AgentTranscript` 和 `AgentRequestSpec` 转成模型请求所需的协议 contract
 *
 * 业务逻辑边界：
 * - 只做协议组装
 * - 它是 transcript 的只读消费者，不修改 transcript
 * - 它回答的是“下一次该发给模型的协议请求长什么样”
 * - 不做 host output
 * - 不做 UI 过滤
 */
import type { AgentRequestOptions, AgentRequestSpec } from '../request/AgentRequestSpec'
import type { AgentContentPart } from './AgentContentPart'
import type { AgentTranscript } from './AgentTranscript'
import type { AgentTranscriptRecord } from './AgentTranscriptRecord'
import { formatToolResultForModel } from '../tools/ToolResultContentProjector'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

export interface MaterializedUserProtocolMessage {
  role: 'user'
  content: AgentContentPart[]
}

export interface MaterializedAssistantProtocolMessage {
  role: 'assistant'
  content: string
  reasoning?: string
  toolCalls?: IToolCall[]
}

export interface MaterializedToolProtocolMessage {
  role: 'tool'
  content: string
  toolCallId: string
  toolName: string
}

export type MaterializedProtocolMessage =
  | MaterializedUserProtocolMessage
  | MaterializedAssistantProtocolMessage
  | MaterializedToolProtocolMessage

export interface MaterializedProtocolRequest {
  adapterPluginId: string
  baseUrl: string
  apiKey: string
  model: string
  modelType?: string
  systemPrompt?: string
  messages: MaterializedProtocolMessage[]
  tools?: unknown[]
  stream?: boolean
  payloadExtensions?: ProviderPayloadExtensions
  requestOverrides?: Record<string, unknown>
  options?: AgentRequestOptions
}

export interface RequestMaterializerInput {
  transcript: AgentTranscript
  requestSpec: AgentRequestSpec
}

export interface RequestMaterializer {
  materialize(input: RequestMaterializerInput): MaterializedProtocolRequest
}

const REQUEST_CONTEXT_SOURCES = new Set<string>([
  MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT,
  MESSAGE_SOURCE.SKILLS_CONTEXT,
  MESSAGE_SOURCE.USER_INFO_CONTEXT,
  MESSAGE_SOURCE.KNOWLEDGEBASE_CONTEXT,
  MESSAGE_SOURCE.EMOTION_CONTEXT,
  MESSAGE_SOURCE.AWAKE_CONTEXT,
  MESSAGE_SOURCE.AVAILABLE_IMAGES_CONTEXT
])

const REDACTED_ARGUMENT_VALUE = '[REDACTED]'
const VISION_AGENT_ANALYZE_TOOL_NAME = 'vision_agent_analyze'

const isRequestContextRecord = (
  record: AgentTranscriptRecord
): boolean => (
  record.kind === 'user'
  && Boolean(record.source && REQUEST_CONTEXT_SOURCES.has(record.source))
)

const partsToText = (parts: AgentContentPart[]): string => parts
  .filter((part): part is Extract<AgentContentPart, { type: 'input_text' }> => part.type === 'input_text')
  .map(part => part.text.trim())
  .filter(Boolean)
  .join('\n\n')

const buildRequestContextPart = (parts: AgentContentPart[]): AgentContentPart | null => {
  const text = partsToText(parts)
  if (!text) {
    return null
  }

  return {
    type: 'input_text',
    text: [
      '<request_context>',
      'The following runtime context applies only to this user request.',
      '',
      text,
      '</request_context>'
    ].join('\n')
  }
}

const appendRequestContext = (
  content: AgentContentPart[],
  requestContextParts: AgentContentPart[]
): AgentContentPart[] => {
  const contextPart = buildRequestContextPart(requestContextParts)
  if (!contextPart) {
    return [...content]
  }

  return [
    ...content,
    contextPart
  ]
}

const stripRawImageParts = (content: AgentContentPart[]): AgentContentPart[] => (
  content.filter(part => part.type !== 'input_image')
)

const isRecordObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
)

const redactVisionImageInput = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return REDACTED_ARGUMENT_VALUE
  }
  if (Array.isArray(value)) {
    return value.map(redactVisionImageInput)
  }
  if (!isRecordObject(value)) {
    return value
  }

  const next = { ...value }
  if (typeof next.url === 'string') {
    next.url = REDACTED_ARGUMENT_VALUE
  }
  if (typeof next.raw_data === 'string') {
    next.raw_data = REDACTED_ARGUMENT_VALUE
  }
  if (Array.isArray(next.url)) {
    next.url = next.url.map(item => typeof item === 'string' ? REDACTED_ARGUMENT_VALUE : item)
  }
  if (Array.isArray(next.urls)) {
    next.urls = next.urls.map(item => typeof item === 'string' ? REDACTED_ARGUMENT_VALUE : item)
  }
  if (Array.isArray(next.raw_data)) {
    next.raw_data = next.raw_data.map(item => typeof item === 'string' ? REDACTED_ARGUMENT_VALUE : item)
  }
  return next
}

const redactStringOrStringArray = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return REDACTED_ARGUMENT_VALUE
  }
  if (Array.isArray(value)) {
    return value.map(item => typeof item === 'string' ? REDACTED_ARGUMENT_VALUE : item)
  }
  return value
}

const sanitizeVisionAgentAnalyzeArguments = (rawArguments: string): string => {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawArguments)
  } catch {
    return JSON.stringify({ redacted: true })
  }

  if (Array.isArray(parsed)) {
    return JSON.stringify(parsed.map(redactVisionImageInput))
  }

  if (!isRecordObject(parsed)) {
    return typeof parsed === 'string'
      ? JSON.stringify(REDACTED_ARGUMENT_VALUE)
      : JSON.stringify(parsed)
  }

  const sanitized: Record<string, unknown> = { ...parsed }
  if (Array.isArray(sanitized.images)) {
    sanitized.images = sanitized.images.map(redactVisionImageInput)
  }
  if ('url' in sanitized) {
    sanitized.url = redactStringOrStringArray(sanitized.url)
  }
  if ('urls' in sanitized) {
    sanitized.urls = redactStringOrStringArray(sanitized.urls)
  }
  if ('raw_data' in sanitized) {
    sanitized.raw_data = redactStringOrStringArray(sanitized.raw_data)
  }

  return JSON.stringify(sanitized)
}

const sanitizeAssistantToolCallsForRequest = (toolCalls: IToolCall[]): IToolCall[] => (
  toolCalls.map(toolCall => {
    if (toolCall.function?.name !== VISION_AGENT_ANALYZE_TOOL_NAME) {
      return toolCall
    }

    return {
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments: sanitizeVisionAgentAnalyzeArguments(toolCall.function.arguments)
      }
    }
  })
)

const hasFollowingAssistantStep = (
  records: AgentTranscriptRecord[],
  recordIndex: number
): boolean => {
  for (let index = recordIndex + 1; index < records.length; index += 1) {
    if (records[index].kind === 'assistant_step') {
      return true
    }
  }

  return false
}

export class DefaultRequestMaterializer implements RequestMaterializer {
  materialize(input: RequestMaterializerInput): MaterializedProtocolRequest {
    const messages: MaterializedProtocolMessage[] = []
    let pendingRequestContextParts: AgentContentPart[] = []

    const flushPendingRequestContext = (): void => {
      if (pendingRequestContextParts.length === 0) {
        return
      }

      const contextPart = buildRequestContextPart(pendingRequestContextParts)
      if (contextPart) {
        messages.push({
          role: 'user',
          content: [contextPart]
        })
      }
      pendingRequestContextParts = []
    }

    for (let recordIndex = 0; recordIndex < input.transcript.records.length; recordIndex += 1) {
      const record = input.transcript.records[recordIndex]

      if (record.kind === 'user' && isRequestContextRecord(record)) {
        pendingRequestContextParts = [
          ...pendingRequestContextParts,
          ...record.content
        ]
        continue
      }

      switch (record.kind) {
        case 'user':
          messages.push({
            role: 'user',
            content: stripRawImageParts(appendRequestContext(record.content, pendingRequestContextParts))
          })
          pendingRequestContextParts = []
          break
        case 'assistant_step':
          flushPendingRequestContext()
          messages.push({
            role: 'assistant',
            content: record.step.content,
            reasoning: record.step.reasoning,
            toolCalls: record.step.toolCalls.length > 0
              ? sanitizeAssistantToolCallsForRequest(record.step.toolCalls)
              : undefined
          })
          break
        case 'tool_result':
          flushPendingRequestContext()
          messages.push({
            role: 'tool',
            content: formatToolResultForModel({
              content: record.content,
              error: record.error,
              replayMode: hasFollowingAssistantStep(input.transcript.records, recordIndex)
                ? 'cold'
                : record.replayMode
            }),
            toolCallId: record.toolCallId,
            toolName: record.toolName
          })
          break
      }
    }

    flushPendingRequestContext()

    return {
      adapterPluginId: input.requestSpec.adapterPluginId,
      baseUrl: input.requestSpec.baseUrl,
      apiKey: input.requestSpec.apiKey,
      model: input.requestSpec.model,
      modelType: input.requestSpec.modelType,
      systemPrompt: input.requestSpec.systemPrompt,
      messages,
      tools: input.requestSpec.tools,
      stream: input.requestSpec.stream,
      payloadExtensions: input.requestSpec.payloadExtensions,
      requestOverrides: input.requestSpec.requestOverrides,
      options: input.requestSpec.options
    }
  }
}
