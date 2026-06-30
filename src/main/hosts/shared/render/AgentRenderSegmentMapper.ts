import type {
  AgentRenderBlock,
  AgentRenderMessageState,
  AgentRenderReasoningBlock,
  AgentRenderTextBlock,
  AgentRenderToolCallState
} from './AgentRenderState'
import type { MessageSegmentPatch } from '@shared/chat/render-events'

export type AgentRenderLayer = 'preview' | 'committed'

export type AgentRenderSegmentMapperOptions = {
  hiddenToolNames?: ReadonlySet<string> | string[]
}

const DEFAULT_HIDDEN_TOOL_NAMES = new Set(['emotion_report'])

const normalizeHiddenToolNames = (
  input?: ReadonlySet<string> | string[]
): ReadonlySet<string> => {
  if (!input) {
    return DEFAULT_HIDDEN_TOOL_NAMES
  }
  return Array.isArray(input) ? new Set(input) : input
}

const buildReasoningSegment = (
  block: AgentRenderReasoningBlock,
  layer: AgentRenderLayer
): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: `${layer}:${block.blockId}`,
  content: block.content,
  timestamp: block.startedAt,
  endedAt: block.endedAt
})

const buildTextSegment = (
  block: AgentRenderTextBlock,
  layer: AgentRenderLayer
): TextSegment => ({
  type: 'text',
  segmentId: `${layer}:${block.blockId}`,
  content: block.content,
  timestamp: block.startedAt
})

export class AgentRenderSegmentMapper {
  private readonly hiddenToolNames: ReadonlySet<string>

  constructor(options: AgentRenderSegmentMapperOptions = {}) {
    this.hiddenToolNames = normalizeHiddenToolNames(options.hiddenToolNames)
  }

  toMessageToolCall(toolCall: AgentRenderToolCallState): IToolCall {
    return {
      id: toolCall.toolCallId,
      index: toolCall.toolCallIndex,
      type: 'function',
      function: {
        name: toolCall.name,
        arguments: toolCall.args || ''
      }
    }
  }

  buildSegments(input: {
    state: AgentRenderMessageState
    timestamp: number
    includeText: boolean
    layer: AgentRenderLayer
  }): MessageSegment[] {
    const segments: MessageSegment[] = []
    const toolCallMap = new Map(
      input.state.toolCalls.map((call) => [call.toolCallId, call] as const)
    )

    for (const block of input.state.blocks) {
      const segment = this.buildSegmentForBlock({
        block,
        toolCallMap,
        includeText: input.includeText,
        layer: input.layer
      })
      if (segment) {
        segments.push(segment)
      }
    }

    if (input.state.failure) {
      const failure = input.state.failure
      segments.push({
        type: 'error',
        segmentId: `${input.layer}:${input.state.stepId || 'unknown-step'}:error`,
        error: {
          name: 'name' in failure && failure.name ? failure.name : 'Error',
          message: failure.message,
          code: 'code' in failure ? failure.code : undefined,
          timestamp: input.timestamp
        }
      })
    }

    return segments
  }

  buildTextPatch(input: {
    state: AgentRenderMessageState
    layer: AgentRenderLayer
    content?: ChatMessage['content']
    typewriterCompleted?: boolean
  }): MessageSegmentPatch | null {
    const textBlock = input.state.blocks.findLast(
      (block): block is AgentRenderTextBlock => block.kind === 'text' && block.content.trim().length > 0
    )
    if (!textBlock) {
      return null
    }

    return {
      segment: buildTextSegment(textBlock, input.layer),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.typewriterCompleted !== undefined ? { typewriterCompleted: input.typewriterCompleted } : {})
    }
  }

  buildReasoningPatch(input: {
    state: AgentRenderMessageState
    layer: AgentRenderLayer
    typewriterCompleted?: boolean
  }): MessageSegmentPatch | null {
    const reasoningBlock = input.state.blocks.findLast(
      (block): block is AgentRenderReasoningBlock => block.kind === 'reasoning' && block.content.trim().length > 0
    )
    if (!reasoningBlock) {
      return null
    }

    return {
      segment: buildReasoningSegment(reasoningBlock, input.layer),
      ...(input.typewriterCompleted !== undefined ? { typewriterCompleted: input.typewriterCompleted } : {})
    }
  }

  private buildSegmentForBlock(input: {
    block: AgentRenderBlock
    toolCallMap: Map<string, AgentRenderToolCallState>
    includeText: boolean
    layer: AgentRenderLayer
  }): MessageSegment | null {
    if (input.block.kind === 'reasoning') {
      return input.block.content.trim()
        ? buildReasoningSegment(input.block, input.layer)
        : null
    }

    if (input.block.kind === 'text') {
      return input.includeText && input.block.content.trim()
        ? buildTextSegment(input.block, input.layer)
        : null
    }

    const call = input.toolCallMap.get(input.block.toolCallId)
    if (!call) {
      return null
    }

    return {
      type: 'toolCall',
      segmentId: `${input.layer}:${input.block.blockId}`,
      name: call.name,
      content: {
        toolName: call.name,
        args: call.args,
        status: call.status,
        ...(call.result !== undefined ? { result: call.result } : {}),
        ...(call.error ? { error: call.error } : {})
      },
      ...(call.executionStartedAt !== undefined ? { executionStartedAt: call.executionStartedAt } : {}),
      ...(call.cost !== undefined ? { cost: call.cost } : {}),
      ...(call.latencyCost !== undefined ? { latencyCost: call.latencyCost } : {}),
      isError: call.status === 'failed' || call.status === 'aborted',
      timestamp: input.block.startedAt,
      toolCallId: call.toolCallId,
      toolCallIndex: call.toolCallIndex,
      ...(this.hiddenToolNames.has(call.name)
        ? {
            presentation: {
              transcriptVisible: false
            }
          }
        : {})
    }
  }
}
