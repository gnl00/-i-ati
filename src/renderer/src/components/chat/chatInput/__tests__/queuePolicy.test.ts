import { describe, expect, it } from 'vitest'
import type { PostRunJobsState, RunPhase } from '@renderer/store/chatStore'
import { isSubmissionBlocked, mergeQueuedMessages, shouldQueueSubmission } from '../queuePolicy'

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
      { text: 'yo', images: [], userInstruction: 'first instruction' },
      { text: 'yo?', images: [], userInstruction: 'second instruction' },
      { text: 'sha?', images: [], userInstruction: 'third instruction' }
    ])).toEqual({
      text: 'yo\nyo?\nsha?',
      images: [],
      userInstruction: 'first instruction'
    })
  })

  it('merges follow-up task details in order', () => {
    expect(mergeQueuedMessages([
      { text: '帮我完成xxx，需要xxx', images: [], userInstruction: '' },
      { text: '这里需要补充一下xxx', images: [], userInstruction: '' },
      { text: '还有这里xxx', images: [], userInstruction: '' }
    ])?.text).toBe('帮我完成xxx，需要xxx\n这里需要补充一下xxx\n还有这里xxx')
  })

  it('merges queued images in order', () => {
    const firstImage = 'data:image/png;base64,first' as unknown as ClipbordImg
    const secondImage = 'data:image/png;base64,second' as unknown as ClipbordImg

    expect(mergeQueuedMessages([
      { text: 'first', images: [firstImage], userInstruction: '' },
      { text: 'second', images: [secondImage], userInstruction: '' }
    ])?.images).toEqual([firstImage, secondImage])
  })

  it('returns null for an empty queue', () => {
    expect(mergeQueuedMessages([])).toBeNull()
  })
})
