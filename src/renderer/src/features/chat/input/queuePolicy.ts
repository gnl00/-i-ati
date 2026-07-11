import type { PostRunJobsState, RunPhase } from '@renderer/features/chat/state/chatStore'

export type ChatQueuePolicyInput = {
  runPhase: RunPhase
  postRunJobs: PostRunJobsState
  queuePaused: boolean
  queuedMessageCount: number
}

export type QueuedChatMessage = {
  text: string
  images: ClipbordImg[]
  userInstruction: string
}

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

export function mergeQueuedMessages(items: QueuedChatMessage[]): QueuedChatMessage | null {
  if (items.length === 0) {
    return null
  }

  const [first] = items
  const text = items
    .map(item => item.text.trim())
    .filter(Boolean)
    .join('\n')
  const images = items.flatMap(item => item.images)

  return {
    text,
    images,
    userInstruction: first.userInstruction
  }
}
