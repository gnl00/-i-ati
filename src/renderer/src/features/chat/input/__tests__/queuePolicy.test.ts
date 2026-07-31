import { describe, expect, it } from 'vitest'
import type { PostRunJobsState, RunPhase } from '@renderer/features/chat/state/chatStore'
import { isSubmissionBlocked, mergeQueuedMessages, shouldQueueSubmission } from '../queuePolicy'
import type { QueuedChatMessage } from '../queuePolicy'

const queuedMessage = (
  id: string,
  text: string,
  images: ClipbordImg[] = []
): QueuedChatMessage => ({
  id,
  status: 'queued' as const,
  text,
  images
})

const idlePostRunJobs: PostRunJobsState = {
  title: 'idle',
  compression: 'idle'
}

describe('chat input queue policy', () => {
  it.each<RunPhase>(['submitting', 'streaming', 'cancelling'])(
    'blocks submission while run phase is %s',
    (runPhase) => {
      expect(isSubmissionBlocked(runPhase, idlePostRunJobs)).toBe(true)
    }
  )

  it('allows submission during title-only post-run work', () => {
    expect(isSubmissionBlocked('post_run', {
      title: 'pending',
      compression: 'idle'
    })).toBe(false)
  })

  it('blocks submission while compression is pending', () => {
    expect(isSubmissionBlocked('idle', {
      title: 'idle',
      compression: 'pending'
    })).toBe(true)
  })

  it('keeps later messages queued until the existing queue drains', () => {
    expect(shouldQueueSubmission({
      runPhase: 'idle',
      postRunJobs: idlePostRunJobs,
      queuePaused: false,
      queuedMessageCount: 1
    })).toBe(true)
  })

  it('merges short queued messages into one multiline payload', () => {
    expect(mergeQueuedMessages([
      queuedMessage('q1', 'yo'),
      queuedMessage('q2', 'yo?'),
      queuedMessage('q3', 'sha?')
    ])).toEqual({
      text: 'yo\nyo?\nsha?',
      images: []
    })
  })

  it('merges follow-up task details in order', () => {
    expect(mergeQueuedMessages([
      queuedMessage('q1', '帮我完成xxx，需要xxx'),
      queuedMessage('q2', '这里需要补充一下xxx'),
      queuedMessage('q3', '还有这里xxx')
    ])?.text).toBe('帮我完成xxx，需要xxx\n这里需要补充一下xxx\n还有这里xxx')
  })

  it('merges queued images in order', () => {
    const firstImage = 'data:image/png;base64,first' as unknown as ClipbordImg
    const secondImage = 'data:image/png;base64,second' as unknown as ClipbordImg

    expect(mergeQueuedMessages([
      queuedMessage('q1', 'first', [firstImage]),
      queuedMessage('q2', 'second', [secondImage])
    ])?.images).toEqual([firstImage, secondImage])
  })

  it('returns null for an empty queue', () => {
    expect(mergeQueuedMessages([])).toBeNull()
  })
})
