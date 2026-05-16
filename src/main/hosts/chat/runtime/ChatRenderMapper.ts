import type { MessageSegmentPatch } from '@shared/chat/render-events'
import { extractEmotionFromToolSegments } from '@main/services/emotion/emotion-state'
import {
  AgentRenderSegmentMapper,
  type AgentRenderBlock,
  type AgentRenderLayer,
  type AgentRenderMessageState
} from '@main/hosts/shared/render'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

export class ChatRenderMapper {
  private readonly segments = new AgentRenderSegmentMapper()

  private attachDerivedMessageSemantics(message: ChatMessage): ChatMessage {
    const emotion = extractEmotionFromToolSegments(message)

    return {
      ...message,
      ...(emotion ? { emotion } : {})
    }
  }

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
    return this.attachDerivedMessageSemantics({
      ...baseBody,
      source: MESSAGE_SOURCE.STREAM_PREVIEW,
      content: state.content,
      segments: this.buildSegments({
        state,
        timestamp,
        includeText: true,
        layer: 'preview'
      }),
      toolCalls: state.toolCalls.length > 0
        ? state.toolCalls.map((toolCall) => this.segments.toMessageToolCall(toolCall))
        : undefined,
      typewriterCompleted: false
    })
  }

  buildPreviewTextPatch(state: AgentRenderMessageState): MessageSegmentPatch | null {
    return this.segments.buildTextPatch({
      state,
      layer: 'preview',
      content: state.content,
      typewriterCompleted: false
    })
  }

  buildPreviewReasoningPatch(state: AgentRenderMessageState): MessageSegmentPatch | null {
    return this.segments.buildReasoningPatch({
      state,
      layer: 'preview',
      typewriterCompleted: false
    })
  }

  buildCommittedBody(args: {
    state: AgentRenderMessageState
    timestamp: number
    baseBody: ChatMessage
    typewriterCompleted?: boolean
  }): ChatMessage {
    const { state, timestamp, baseBody, typewriterCompleted = false } = args
    return this.attachDerivedMessageSemantics({
      ...baseBody,
      content: state.content,
      segments: this.buildSegments({
        state,
        timestamp,
        includeText: Boolean(state.content.trim()),
        layer: 'committed'
      }),
      toolCalls: state.toolCalls.length > 0
        ? state.toolCalls.map((toolCall) => this.segments.toMessageToolCall(toolCall))
        : undefined,
      typewriterCompleted
    })
  }

  buildSegments(input: {
    state: AgentRenderMessageState
    timestamp: number
    includeText: boolean
    layer: AgentRenderLayer
  }): MessageSegment[] {
    return this.segments.buildSegments(input)
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
