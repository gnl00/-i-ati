import type { AssistantCycleSnapshot } from '@main/services/agentCore/execution'

type AssistantStepView = {
  committedBody: ChatMessage
  previewBody: ChatMessage | null
}

export class AssistantStepAssembler {
  private committedBody: ChatMessage
  private previewBody: ChatMessage | null = null
  private currentCyclePersistentSegments: MessageSegment[] = []

  constructor(baseBody: ChatMessage) {
    this.committedBody = {
      ...baseBody,
      segments: [...(baseBody.segments || [])]
    }
  }

  beginCycle(): AssistantStepView {
    this.previewBody = null
    this.currentCyclePersistentSegments = []
    return this.getView()
  }

  updatePreview(snapshot: AssistantCycleSnapshot): AssistantStepView {
    this.previewBody = {
      ...this.committedBody,
      source: 'stream_preview',
      content: snapshot.content,
      segments: [...snapshot.segments],
      toolCalls: snapshot.toolCalls ? [...snapshot.toolCalls] : undefined,
      typewriterCompleted: false
    }

    return this.getView()
  }

  clearPreview(): AssistantStepView {
    this.previewBody = null
    return this.getView()
  }

  commitToolCycle(snapshot: AssistantCycleSnapshot): AssistantStepView {
    const visibleSegments = snapshot.segments.filter(segment => (
      segment.type === 'reasoning' || segment.type === 'toolCall' || segment.type === 'error'
    ))

    const carryoverSegments = this.getCommittedPersistentSegments().filter((segment) => {
      return !this.currentCyclePersistentSegments.includes(segment)
    })

    this.currentCyclePersistentSegments = [...visibleSegments]

    this.committedBody = {
      ...this.committedBody,
      content: '',
      segments: [...carryoverSegments, ...visibleSegments],
      toolCalls: this.mergeToolCalls(snapshot.toolCalls),
      typewriterCompleted: false
    }
    this.previewBody = null

    return this.getView()
  }

  commitFinalCycle(snapshot: AssistantCycleSnapshot): AssistantStepView {
    const previewWasActive = Boolean(this.previewBody)

    this.committedBody = {
      ...this.committedBody,
      content: snapshot.content,
      segments: [...this.getCommittedPersistentSegments(), ...snapshot.segments],
      toolCalls: this.mergeToolCalls(snapshot.toolCalls),
      // When preview already typed the final text live, avoid replaying it again on commit.
      typewriterCompleted: previewWasActive
    }
    this.previewBody = null

    return this.getView()
  }

  getView(): AssistantStepView {
    return {
      committedBody: {
        ...this.committedBody,
        segments: [...(this.committedBody.segments || [])]
      },
      previewBody: this.previewBody
        ? {
            ...this.previewBody,
            segments: [...(this.previewBody.segments || [])]
          }
        : null
    }
  }

  private getCommittedPersistentSegments(): MessageSegment[] {
    return (this.committedBody.segments || []).filter(segment => (
      segment.type === 'reasoning' || segment.type === 'toolCall' || segment.type === 'error'
    ))
  }

  private mergeToolCalls(nextToolCalls?: IToolCall[]): IToolCall[] | undefined {
    const merged = new Map<string, IToolCall>()

    for (const call of this.committedBody.toolCalls || []) {
      if (!call.id) continue
      merged.set(call.id, call)
    }

    for (const call of nextToolCalls || []) {
      if (!call.id) continue
      merged.set(call.id, call)
    }

    return merged.size > 0 ? [...merged.values()] : undefined
  }
}
