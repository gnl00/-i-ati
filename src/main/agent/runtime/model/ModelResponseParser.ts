/**
 * ModelResponseParser
 *
 * 放置内容：
 * - 把当前模型响应流解析成 loop 可消费的 step facts
 *
 * 业务逻辑边界：
 * - 它是规范化 `ModelResponseChunk` 和 `AgentStepDraft` 之间的显式桥接
 * - 它不直接改写 transcript
 */
import type { AgentStepDraftDelta } from '../step/AgentStepDraft'
import type { ModelResponseChunk } from './ModelResponseChunk'
import type { RuntimeClock } from '../loop/RuntimeClock'
import {
  ThinkTagTokenizer,
  type ThinkTagTokenizerState
} from './ThinkTagTokenizer'

export interface ToolCallAssemblyState {
  toolCallId: string
  toolCallIndex?: number
  toolName?: string
  argumentsBuffer: string
  readyEmitted?: boolean
}

export interface ModelResponseParserState {
  isInThinkTag: boolean
  pendingThinkTagPrefix?: string
  toolCallAssemblies: ToolCallAssemblyState[]
}

export interface ModelResponseParserInput {
  chunk: ModelResponseChunk
  state: ModelResponseParserState
  toolCalls: IToolCall[]
}

export interface ParsedModelChunk {
  deltas: AgentStepDraftDelta[]
  toolCallsSnapshot: IToolCall[]
  state: ModelResponseParserState
}

export interface ModelResponseParser {
  parse(input: ModelResponseParserInput): ParsedModelChunk
}

export const createInitialModelResponseParserState = (): ModelResponseParserState => ({
  isInThinkTag: false,
  pendingThinkTagPrefix: '',
  toolCallAssemblies: []
})

const parseJsonLike = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export class DefaultModelResponseParser implements ModelResponseParser {
  private readonly thinkTagTokenizer = new ThinkTagTokenizer()

  constructor(private readonly runtimeClock: RuntimeClock) {}

  parse(input: ModelResponseParserInput): ParsedModelChunk {
    if (input.chunk.kind === 'final') {
      const deltas: AgentStepDraftDelta[] = []

      if (input.chunk.responseId || input.chunk.model) {
        deltas.push({
          type: 'response_metadata',
          timestamp: this.runtimeClock.now(),
          responseId: input.chunk.responseId,
          model: input.chunk.model
        })
      }

      return {
        deltas,
        toolCallsSnapshot: input.toolCalls,
        state: input.state
      }
    }

    const deltas: AgentStepDraftDelta[] = []
    const tokenizerState: ThinkTagTokenizerState = {
      isInThinkTag: input.state.isInThinkTag,
      pendingThinkTagPrefix: input.state.pendingThinkTagPrefix ?? ''
    }

    if (input.chunk.responseId || input.chunk.model) {
      deltas.push({
        type: 'response_metadata',
        timestamp: this.runtimeClock.now(),
        responseId: input.chunk.responseId,
        model: input.chunk.model
      })
    }

    if (input.chunk.reasoning) {
      deltas.push({
        type: 'reasoning_delta',
        timestamp: this.runtimeClock.now(),
        reasoning: input.chunk.reasoning
      })
    }

    if (input.chunk.content) {
      for (const token of this.thinkTagTokenizer.parse(input.chunk.content, tokenizerState)) {
        if (token.type === 'reasoning') {
          deltas.push({
            type: 'reasoning_delta',
            timestamp: this.runtimeClock.now(),
            reasoning: token.content
          })
        } else {
          deltas.push({
            type: 'content_delta',
            timestamp: this.runtimeClock.now(),
            content: token.content
          })
        }
      }
    }

    const nextAssemblies = input.state.toolCallAssemblies.map(assembly => ({ ...assembly }))
    const toolCallsSnapshot = input.toolCalls.map(toolCall => ({ ...toolCall }))

    for (const toolCallChunk of input.chunk.toolCalls || []) {
      const assembly = this.upsertAssembly(nextAssemblies, toolCallsSnapshot, toolCallChunk.toolCall)

      if (toolCallChunk.toolCall.function?.name && !assembly.toolName) {
        assembly.toolName = toolCallChunk.toolCall.function.name
        deltas.push({
          type: 'tool_call_started',
          timestamp: this.runtimeClock.now(),
          toolCallId: assembly.toolCallId,
          toolCallIndex: assembly.toolCallIndex,
          toolName: assembly.toolName
        })
      } else if (toolCallChunk.toolCall.function?.name) {
        assembly.toolName = toolCallChunk.toolCall.function.name
      }

      if (toolCallChunk.argumentsMode === 'snapshot') {
        assembly.argumentsBuffer = toolCallChunk.toolCall.function?.arguments || ''
      } else if (toolCallChunk.toolCall.function?.arguments) {
        assembly.argumentsBuffer += toolCallChunk.toolCall.function.arguments
      }

      this.syncToolCallSnapshot(toolCallsSnapshot, assembly)

      if (
        assembly.toolName &&
        !assembly.readyEmitted &&
        (parseJsonLike(assembly.argumentsBuffer) || input.chunk.finishReason === 'tool_calls')
      ) {
        assembly.readyEmitted = true
        deltas.push({
          type: 'tool_call_ready',
          timestamp: this.runtimeClock.now(),
          toolCall: this.toToolCall(assembly)
        })
      }
    }

    if (input.chunk.finishReason) {
      deltas.push({
        type: 'finish_reason',
        timestamp: this.runtimeClock.now(),
        finishReason: input.chunk.finishReason
      })
    }

    if (input.chunk.usage) {
      deltas.push({
        type: 'usage_delta',
        timestamp: this.runtimeClock.now(),
        usage: input.chunk.usage
      })
    }

    return {
      deltas,
      toolCallsSnapshot,
      state: {
        isInThinkTag: tokenizerState.isInThinkTag,
        pendingThinkTagPrefix: tokenizerState.pendingThinkTagPrefix,
        toolCallAssemblies: nextAssemblies
      }
    }
  }

  private upsertAssembly(
    assemblies: ToolCallAssemblyState[],
    toolCallsSnapshot: IToolCall[],
    toolCall: IToolCall
  ): ToolCallAssemblyState {
    const existing =
      assemblies.find(candidate =>
        (toolCall.id && candidate.toolCallId === toolCall.id) ||
        (toolCall.index !== undefined && candidate.toolCallIndex === toolCall.index)
      )
      || this.findAssemblyFromSnapshot(assemblies, toolCallsSnapshot, toolCall)

    if (existing) {
      if (toolCall.index !== undefined) {
        existing.toolCallIndex = toolCall.index
      }
      return existing
    }

    const created: ToolCallAssemblyState = {
      toolCallId: toolCall.id,
      toolCallIndex: toolCall.index,
      toolName: undefined,
      argumentsBuffer: '',
      readyEmitted: false
    }
    assemblies.push(created)
    return created
  }

  private findAssemblyFromSnapshot(
    assemblies: ToolCallAssemblyState[],
    toolCallsSnapshot: IToolCall[],
    toolCall: IToolCall
  ): ToolCallAssemblyState | undefined {
    const snapshotMatch = toolCallsSnapshot.find(candidate =>
      (toolCall.id && candidate.id === toolCall.id) ||
      (toolCall.index !== undefined && candidate.index === toolCall.index)
    )
    if (!snapshotMatch) {
      return undefined
    }
    return assemblies.find(candidate => candidate.toolCallId === snapshotMatch.id)
  }

  private syncToolCallSnapshot(
    snapshot: IToolCall[],
    assembly: ToolCallAssemblyState
  ): void {
    const normalized = this.toToolCall(assembly)
    const existingIndex = snapshot.findIndex(candidate =>
      candidate.id === normalized.id ||
      (normalized.index !== undefined && candidate.index === normalized.index)
    )

    if (existingIndex >= 0) {
      snapshot[existingIndex] = normalized
      return
    }

    snapshot.push(normalized)
  }

  private toToolCall(assembly: ToolCallAssemblyState): IToolCall {
    return {
      id: assembly.toolCallId,
      index: assembly.toolCallIndex,
      type: 'function',
      function: {
        name: assembly.toolName || '',
        arguments: assembly.argumentsBuffer
      }
    }
  }
}
