import type { MessageSegmentPatch } from '@shared/run/output-events'
import type {
  AgentRenderBlock,
  AgentRenderMessageState,
  AgentRenderReasoningBlock,
  AgentRenderTextBlock,
  AgentRenderToolCallState
} from '@main/hosts/shared/render'

type RenderLayer = 'preview' | 'committed'

const toMessageToolCall = (toolCall: AgentRenderToolCallState): IToolCall => ({
  id: toolCall.toolCallId,
  index: toolCall.toolCallIndex,
  type: 'function',
  function: {
    name: toolCall.name,
    arguments: toolCall.args || ''
  }
})

const buildReasoningSegment = (
  block: AgentRenderReasoningBlock,
  layer: RenderLayer
): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: `${layer}:${block.blockId}`,
  content: block.content,
  timestamp: block.startedAt,
  endedAt: block.endedAt
})

const buildTextSegment = (
  block: AgentRenderTextBlock,
  layer: RenderLayer
): TextSegment => ({
  type: 'text',
  segmentId: `${layer}:${block.blockId}`,
  content: block.content,
  timestamp: block.startedAt
})

const buildSegments = (input: {
  state: AgentRenderMessageState
  timestamp: number
  includeText: boolean
  layer: RenderLayer
}): MessageSegment[] => {
  const segments: MessageSegment[] = []
  const toolCallMap = new Map(
    input.state.toolCalls.map((call) => [call.toolCallId, call] as const)
  )

  for (const block of input.state.blocks) {
    if (block.kind === 'reasoning') {
      if (block.content.trim()) {
        segments.push(buildReasoningSegment(block, input.layer))
      }
      continue
    }

    if (block.kind === 'text') {
      if (input.includeText && block.content.trim()) {
        segments.push(buildTextSegment(block, input.layer))
      }
      continue
    }

    const call = toolCallMap.get(block.toolCallId)
    if (!call) {
      continue
    }

    segments.push({
      type: 'toolCall',
      segmentId: `${input.layer}:${block.blockId}`,
      name: call.name,
      content: {
        toolName: call.name,
        args: call.args,
        status: call.status,
        ...(call.result !== undefined ? { result: call.result } : {}),
        ...(call.error ? { error: call.error } : {})
      },
      ...(call.cost !== undefined ? { cost: call.cost } : {}),
      isError: call.status === 'failed' || call.status === 'aborted',
      timestamp: block.startedAt,
      toolCallId: call.toolCallId,
      toolCallIndex: call.toolCallIndex
    })
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

export class ChatRenderMapper {
  canEmitOptimizedTextPreviewPatch(
    previousState: AgentRenderMessageState,
    nextState: AgentRenderMessageState
  ): boolean {
    const previousLastBlock = previousState.blocks.at(-1)
    const nextLastBlock = nextState.blocks.at(-1)
    return this.isSameOpenBlockTransition(previousLastBlock, nextLastBlock, 'text')
      && previousState.blocks.length === nextState.blocks.length
  }

  canEmitOptimizedReasoningPreviewPatch(
    previousState: AgentRenderMessageState,
    nextState: AgentRenderMessageState
  ): boolean {
    const previousLastBlock = previousState.blocks.at(-1)
    const nextLastBlock = nextState.blocks.at(-1)
    return this.isSameOpenBlockTransition(previousLastBlock, nextLastBlock, 'reasoning')
      && previousState.blocks.length === nextState.blocks.length
  }

  buildPreviewBody(args: {
    state: AgentRenderMessageState
    timestamp: number
    baseBody: ChatMessage
  }): ChatMessage {
    const { state, timestamp, baseBody } = args
    return {
      ...baseBody,
      source: 'stream_preview',
      content: state.content,
      segments: buildSegments({
        state,
        timestamp,
        includeText: true,
        layer: 'preview'
      }),
      toolCalls: state.toolCalls.length > 0
        ? state.toolCalls.map(toMessageToolCall)
        : undefined,
      typewriterCompleted: false
    }
  }

  buildPreviewTextPatch(state: AgentRenderMessageState): MessageSegmentPatch | null {
    const textBlock = state.blocks.findLast(
      (block): block is AgentRenderTextBlock => block.kind === 'text' && block.content.trim().length > 0
    )
    if (!textBlock) {
      return null
    }

    return {
      segment: buildTextSegment(textBlock, 'preview'),
      content: state.content,
      typewriterCompleted: false
    }
  }

  buildPreviewReasoningPatch(state: AgentRenderMessageState): MessageSegmentPatch | null {
    const reasoningBlock = state.blocks.findLast(
      (block): block is AgentRenderReasoningBlock => block.kind === 'reasoning' && block.content.trim().length > 0
    )
    if (!reasoningBlock) {
      return null
    }

    return {
      segment: buildReasoningSegment(reasoningBlock, 'preview'),
      typewriterCompleted: false
    }
  }

  buildCommittedBody(args: {
    state: AgentRenderMessageState
    timestamp: number
    baseBody: ChatMessage
    typewriterCompleted?: boolean
  }): ChatMessage {
    const { state, timestamp, baseBody, typewriterCompleted = false } = args
    return {
      ...baseBody,
      content: state.content,
      segments: buildSegments({
        state,
        timestamp,
        includeText: Boolean(state.content.trim()),
        layer: 'committed'
      }),
      toolCalls: state.toolCalls.length > 0
        ? state.toolCalls.map(toMessageToolCall)
        : undefined,
      typewriterCompleted
    }
  }

  private isSameOpenBlockTransition(
    previousBlock: AgentRenderBlock | undefined,
    nextBlock: AgentRenderBlock | undefined,
    expectedKind: AgentRenderBlock['kind']
  ): boolean {
    return previousBlock?.kind === expectedKind
      && nextBlock?.kind === expectedKind
      && previousBlock.blockId === nextBlock.blockId
      && typeof previousBlock.endedAt !== 'number'
      && typeof nextBlock.endedAt !== 'number'
  }
}
