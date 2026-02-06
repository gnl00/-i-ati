import type { ChatSubmitEvent } from './events'

type ChatSubmitEnvelopeLike = Pick<ChatSubmitEvent, 'type' | 'sequence' | 'submissionId'>

export class SubmissionEventService {
  private readonly handledOnce = new Set<string>()
  private readonly lastChunkSequence = new Map<string, number>()
  private readonly activeSubscriptions = new Map<string, () => void>()

  markOnce(type: string, submissionId?: string): boolean {
    const key = submissionId ? `${type}:${submissionId}` : type
    if (this.handledOnce.has(key)) {
      return false
    }
    this.handledOnce.add(key)
    return true
  }

  shouldProcessEvent(event: ChatSubmitEnvelopeLike): boolean {
    if (event.type !== 'stream.chunk') {
      return true
    }
    const lastSeq = this.lastChunkSequence.get(event.submissionId) ?? 0
    if (event.sequence <= lastSeq) {
      return false
    }
    this.lastChunkSequence.set(event.submissionId, event.sequence)
    return true
  }

  replaceActiveSubscription(submissionId: string, unsubscribe: () => void): void {
    const existing = this.activeSubscriptions.get(submissionId)
    if (existing) {
      existing()
      this.activeSubscriptions.delete(submissionId)
    }
    this.activeSubscriptions.set(submissionId, unsubscribe)
  }

  clearActiveSubscription(submissionId: string, unsubscribe?: () => void): void {
    const current = this.activeSubscriptions.get(submissionId)
    if (!current) {
      return
    }
    if (!unsubscribe || current === unsubscribe) {
      this.activeSubscriptions.delete(submissionId)
    }
  }

  clearSubmission(submissionId: string): void {
    this.lastChunkSequence.delete(submissionId)
  }
}
