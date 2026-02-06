import { describe, expect, it } from 'vitest'
import { isLifecycleEventType, isStreamEventType, isToolEventType } from '../chat-submit-event-router'

describe('chat submit event router', () => {
  it('classifies lifecycle events', () => {
    expect(isLifecycleEventType('stream.started')).toBe(true)
    expect(isLifecycleEventType('submission.failed')).toBe(true)
    expect(isLifecycleEventType('tool.exec.started')).toBe(false)
  })

  it('classifies stream events', () => {
    expect(isStreamEventType('stream.chunk')).toBe(true)
    expect(isStreamEventType('stream.completed')).toBe(false)
  })

  it('classifies tool events', () => {
    expect(isToolEventType('tool.call.flushed')).toBe(true)
    expect(isToolEventType('tool.exec.completed')).toBe(true)
    expect(isToolEventType('chat.updated')).toBe(false)
  })
})
