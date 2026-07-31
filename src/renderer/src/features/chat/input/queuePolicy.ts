import type { PostRunJobsState, RunPhase } from '@renderer/features/chat/state/chatStore'

export type ChatQueuePolicyInput = {
  runPhase: RunPhase
  postRunJobs: PostRunJobsState
  queuePaused: boolean
  queuedMessageCount: number
}

export type QueuedChatMessage = {
  id: string
  status: 'queued' | 'inserting'
  text: string
  images: ClipbordImg[]
}

export type QueuedChatMessagePayload = Pick<QueuedChatMessage, 'text' | 'images'>

export function isSubmissionBlocked(
  runPhase: RunPhase,
  postRunJobs: PostRunJobsState
): boolean {
  return runPhase === 'submitting'
    || runPhase === 'streaming'
    || runPhase === 'cancelling'
    || postRunJobs.compression === 'pending'
}

export function shouldQueueSubmission(input: ChatQueuePolicyInput): boolean {
  return isSubmissionBlocked(input.runPhase, input.postRunJobs)
    || input.queuePaused
    || input.queuedMessageCount > 0
}

export function mergeQueuedMessages(items: QueuedChatMessage[]): QueuedChatMessagePayload | null {
  if (items.length === 0) {
    return null
  }

  const text = items
    .map(item => item.text.trim())
    .filter(Boolean)
    .join('\n')
  const images = items.flatMap(item => item.images)

  return {
    text,
    images
  }
}
