import type {
  AgentRenderBlock,
  AgentRenderMessageState,
  AgentRenderReasoningBlock,
  AgentRenderTextBlock,
  AgentRenderToolCallState
} from './AgentRenderState'
import type { MessageSegmentPatch } from '@shared/chat/render-events'
import { HostStepOutputPolicy } from './HostStepOutputPolicy'

export type AgentRenderLayer = 'preview' | 'committed'

export type AgentRenderSegmentMapperOptions = {
  /**
   * 可见性策略。默认使用共享的 HostStepOutputPolicy（含默认 hidden tool 名单）。
   * 也允许传入 tool 名单数组/集合作为向后兼容的便捷写法。
   */
  policy?: HostStepOutputPolicy
  hiddenToolNames?: ReadonlySet<string> | string[]
}

const resolvePolicy = (
  options: AgentRenderSegmentMapperOptions
): HostStepOutputPolicy => {
  if (options.policy) {
    return options.policy
  }
  if (options.hiddenToolNames) {
    return new HostStepOutputPolicy(options.hiddenToolNames)
  }
  return new HostStepOutputPolicy()
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
  private readonly policy: HostStepOutputPolicy

  constructor(options: AgentRenderSegmentMapperOptions = {}) {
    this.policy = resolvePolicy(options)
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
      ...(this.policy.isToolHidden(call.name)
        ? {
            presentation: {
              transcriptVisible: false
            }
          }
        : {})
    }
  }
}
