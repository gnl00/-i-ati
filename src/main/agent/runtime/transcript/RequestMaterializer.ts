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
import { compactToolContentForModelRequest } from '@shared/tools/toolResultContent'
import { isNormalizedToolResultContent } from '../tools/result-normalization'
import type { AgentTranscriptToolResultRecord } from './AgentTranscriptRecord'

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

const safeStringifyToolContent = (content: unknown, error?: { message: string }): string => {
  if (typeof content === 'string') {
    return content
  }

  if (content === undefined || content === null) {
    return error?.message ?? ''
  }

  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

const stringifyToolResultContent = (
  content: unknown,
  error?: { message: string },
  options: { replayMode?: AgentTranscriptToolResultRecord['replayMode'] } = {}
): string => {
  if (isNormalizedToolResultContent(content)) {
    return content.modelContent
  }

  if (options.replayMode === 'hot') {
    return safeStringifyToolContent(content, error)
  }

  if (typeof content === 'string') {
    return compactToolContentForModelRequest(content)
  }

  if (content === undefined || content === null) {
    return error?.message ?? ''
  }

  try {
    return compactToolContentForModelRequest(JSON.stringify(content))
  } catch {
    return compactToolContentForModelRequest(String(content))
  }
}

export class DefaultRequestMaterializer implements RequestMaterializer {
  materialize(input: RequestMaterializerInput): MaterializedProtocolRequest {
    const messages: MaterializedProtocolMessage[] = input.transcript.records.map((record) => {
      switch (record.kind) {
        case 'user':
          return {
            role: 'user',
            content: [...record.content]
          }
        case 'assistant_step':
          return {
            role: 'assistant',
            content: record.step.content,
            reasoning: record.step.reasoning,
            toolCalls: record.step.toolCalls.length > 0 ? [...record.step.toolCalls] : undefined
          }
        case 'tool_result':
          return {
            role: 'tool',
            content: stringifyToolResultContent(record.content, record.error, {
              replayMode: record.replayMode
            }),
            toolCallId: record.toolCallId,
            toolName: record.toolName
          }
      }
    })

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
      requestOverrides: input.requestSpec.requestOverrides,
      options: input.requestSpec.options
    }
  }
}
