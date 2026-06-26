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
import type { AgentTranscriptRecord, AgentTranscriptUserRecord } from './AgentTranscriptRecord'
import { projectToolResultContentForModelReplay } from '../tools/ToolResultContentProjector'
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
  MESSAGE_SOURCE.AWAKE_CONTEXT
])

const isRequestContextRecord = (
  record: AgentTranscriptRecord
): record is AgentTranscriptUserRecord => (
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

    for (const record of input.transcript.records) {
      if (isRequestContextRecord(record)) {
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
            content: appendRequestContext(record.content, pendingRequestContextParts)
          })
          pendingRequestContextParts = []
          break
        case 'assistant_step':
          flushPendingRequestContext()
          messages.push({
            role: 'assistant',
            content: record.step.content,
            reasoning: record.step.reasoning,
            toolCalls: record.step.toolCalls.length > 0 ? [...record.step.toolCalls] : undefined
          })
          break
        case 'tool_result':
          flushPendingRequestContext()
          messages.push({
            role: 'tool',
            content: projectToolResultContentForModelReplay({
              content: record.content,
              error: record.error,
              replayMode: record.replayMode
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
