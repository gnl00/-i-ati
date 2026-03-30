import type { ParseResult, SegmentDelta } from './parser'
import { SegmentBuilder } from './parser'
import { extractContentFromSegments } from './parser/segment-content'

export type AssistantCycleSnapshot = {
  content: string
  segments: MessageSegment[]
  toolCalls?: IToolCall[]
}

export class AssistantCycleBuffer {
  private segments: MessageSegment[] = []
  private toolCalls?: IToolCall[]

  reset(): void {
    this.segments = []
    this.toolCalls = undefined
  }

  setContent(content: string): void {
    this.segments = content.trim()
      ? [{
          type: 'text',
          content,
          timestamp: Date.now()
        }]
      : []
  }

  applyParseResult(result: ParseResult): void {
    const segmentBuilder = new SegmentBuilder()
    const orderedSegmentDeltas: SegmentDelta[] =
      result.segmentDeltas.length > 0
        ? result.segmentDeltas
        : [
            ...(result.reasoningDelta
              ? ([{ type: 'reasoning', content: result.reasoningDelta }] as SegmentDelta[])
              : []),
            ...(result.contentDelta
              ? ([{ type: 'text', content: result.contentDelta }] as SegmentDelta[])
              : [])
          ]

    let nextSegments = [...this.segments]
    for (const segmentDelta of orderedSegmentDeltas) {
      if (!segmentDelta.content.trim()) {
        continue
      }
      nextSegments = segmentBuilder.appendSegment(
        nextSegments,
        segmentDelta.content,
        segmentDelta.type
      )
    }

    this.segments = nextSegments
  }

  setToolCalls(toolCalls: IToolCall[]): void {
    this.toolCalls = toolCalls
  }

  appendToolResultSegment(segment: MessageSegment): void {
    this.segments = [...this.segments, segment]
  }

  snapshot(): AssistantCycleSnapshot {
    return {
      content: extractContentFromSegments(this.segments),
      segments: [...this.segments],
      toolCalls: this.toolCalls ? [...this.toolCalls] : undefined
    }
  }
}
