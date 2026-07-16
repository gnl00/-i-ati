import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const mocks = vi.hoisted(() => {
  const notificationInstances: Array<{
    options: { title: string; body: string; silent: boolean }
    on: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
  }> = []

  const NotificationCtor = vi.fn(function (options: { title: string; body: string; silent: boolean }) {
    const instance = {
      options,
      on: vi.fn(),
      show: vi.fn()
    }
    notificationInstances.push(instance)
    return instance
  }) as unknown as Mock & {
    isSupported: ReturnType<typeof vi.fn>
  }
  NotificationCtor.isSupported = vi.fn(() => true)

  return {
    notificationInstances,
    NotificationCtor,
    app: { badgeCount: 0 },
    isMainWindowForeground: vi.fn(() => false),
    showMainWindow: vi.fn()
  }
})

vi.mock('electron', () => ({
  Notification: mocks.NotificationCtor,
  app: mocks.app
}))

vi.mock('../../main-window', () => ({
  isMainWindowForeground: mocks.isMainWindowForeground,
  showMainWindow: mocks.showMainWindow
}))

import type { AgentEvent } from '../../agent/runtime/events/AgentEvent'
import { AgentNotificationSink, liveNotificationCount } from '../AgentNotificationSink'

function completedEvent(content?: string): AgentEvent {
  return {
    type: 'loop.completed',
    timestamp: 0,
    result: {
      status: 'completed',
      startedAt: 0,
      completedAt: 0,
      transcript: {} as never,
      finalStep: { content } as never
    }
  } as AgentEvent
}

function failedEvent(message?: string): AgentEvent {
  return {
    type: 'loop.failed',
    timestamp: 0,
    result: {
      status: 'failed',
      startedAt: 0,
      completedAt: 0,
      transcript: {} as never,
      failure: message ? { message } : undefined
    }
  } as unknown as AgentEvent
}

function abortedEvent(): AgentEvent {
  return {
    type: 'loop.aborted',
    timestamp: 0,
    result: {
      status: 'aborted',
      startedAt: 0,
      completedAt: 0,
      transcript: {} as never,
      abortReason: 'user'
    }
  } as AgentEvent
}

describe('AgentNotificationSink', () => {
  let sink: AgentNotificationSink

  beforeEach(() => {
    mocks.notificationInstances.length = 0
    mocks.NotificationCtor.mockClear()
    mocks.NotificationCtor.isSupported.mockReturnValue(true)
    mocks.app.badgeCount = 0
    mocks.isMainWindowForeground.mockReturnValue(false)
    mocks.showMainWindow.mockClear()
    sink = new AgentNotificationSink()
  })

  it('skips notification when the window is in the foreground', () => {
    mocks.isMainWindowForeground.mockReturnValue(true)
    sink.handle(completedEvent('done'))
    expect(mocks.NotificationCtor).not.toHaveBeenCalled()
  })

  it('isolates errors from checking whether the window is in the foreground', () => {
    mocks.isMainWindowForeground.mockImplementationOnce(() => {
      throw new Error('foreground check failed')
    })

    expect(() => sink.handle(completedEvent('done'))).not.toThrow()
    expect(mocks.NotificationCtor).not.toHaveBeenCalled()
  })

  it('shows a non-silent completion notification in the background', () => {
    sink.handle(completedEvent('all tests passed'))
    expect(mocks.notificationInstances).toHaveLength(1)
    const instance = mocks.notificationInstances[0]
    expect(instance.options).toMatchObject({
      title: '@i run completed',
      body: 'all tests passed',
      silent: false
    })
    expect(instance.show).toHaveBeenCalledOnce()
  })

  it('increments the dock badge count after showing a notification', () => {
    sink.handle(completedEvent('done'))
    expect(mocks.app.badgeCount).toBe(1)
  })

  it('increments the badge for failure notifications too', () => {
    sink.handle(failedEvent('boom'))
    expect(mocks.app.badgeCount).toBe(1)
  })

  it('accumulates the badge count across multiple background notifications', () => {
    sink.handle(completedEvent('first'))
    sink.handle(completedEvent('second'))
    expect(mocks.app.badgeCount).toBe(2)
  })

  it('does not increment the badge when the window is in the foreground', () => {
    mocks.isMainWindowForeground.mockReturnValue(true)
    sink.handle(completedEvent('done'))
    expect(mocks.app.badgeCount).toBe(0)
  })

  it('focuses the main window when the notification is clicked', () => {
    sink.handle(completedEvent('done'))
    const instance = mocks.notificationInstances[0]
    const clickCall = instance.on.mock.calls.find(([eventName]) => eventName === 'click')
    expect(clickCall).toBeDefined()
    const [, handler] = clickCall!
    handler()
    expect(mocks.showMainWindow).toHaveBeenCalledOnce()
  })

  describe('GC-safety references', () => {
    it('retains a strong reference to the notification after show', () => {
      const before = liveNotificationCount()
      sink.handle(completedEvent('done'))
      expect(liveNotificationCount()).toBe(before + 1)
    })

    it('releases the reference when the notification is clicked', () => {
      const before = liveNotificationCount()
      sink.handle(completedEvent('done'))
      const instance = mocks.notificationInstances[mocks.notificationInstances.length - 1]
      const clickHandler = instance.on.mock.calls.find(([eventName]) => eventName === 'click')![1]
      clickHandler()
      expect(liveNotificationCount()).toBe(before)
    })

    it('releases the reference when the notification is closed', () => {
      const before = liveNotificationCount()
      sink.handle(completedEvent('done'))
      const instance = mocks.notificationInstances[mocks.notificationInstances.length - 1]
      const closeHandler = instance.on.mock.calls.find(([eventName]) => eventName === 'close')![1]
      closeHandler()
      expect(liveNotificationCount()).toBe(before)
    })
  })

  it('shows a silent failure notification with the failure message', () => {
    sink.handle(failedEvent('boom'))
    expect(mocks.notificationInstances[0].options).toMatchObject({
      title: '@i run failed',
      body: 'boom',
      silent: true
    })
  })

  it('uses chat title for completion notifications when provided', () => {
    const titledSink = new AgentNotificationSink('Refactor login')
    titledSink.handle(completedEvent('done'))
    expect(mocks.notificationInstances[0].options.title).toBe('Refactor login')
  })

  it('uses chat title for failure notifications when provided', () => {
    const titledSink = new AgentNotificationSink('Fix bug')
    titledSink.handle(failedEvent('boom'))
    expect(mocks.notificationInstances[0].options.title).toBe('Fix bug')
  })

  it('falls back to default title when chat title is empty or whitespace', () => {
    const titledSink = new AgentNotificationSink('  ')
    titledSink.handle(completedEvent('done'))
    expect(mocks.notificationInstances[0].options.title).toBe('@i run completed')
  })

  it('falls back to default text when the failure has no message', () => {
    sink.handle(failedEvent(''))
    expect(mocks.notificationInstances[0].options.body).toBe('Error occurred during execution')
  })

  it('does not notify on abort', () => {
    sink.handle(abortedEvent())
    expect(mocks.NotificationCtor).not.toHaveBeenCalled()
  })

  it('does not increment the badge on abort', () => {
    sink.handle(abortedEvent())
    expect(mocks.app.badgeCount).toBe(0)
  })

  it('does nothing when notifications are unsupported', () => {
    mocks.NotificationCtor.isSupported.mockReturnValue(false)
    sink.handle(completedEvent('done'))
    expect(mocks.notificationInstances).toHaveLength(0)
  })

  describe('summarize', () => {
    it('falls back to default text for empty content', () => {
      sink.handle(completedEvent('   '))
      expect(mocks.notificationInstances[0].options.body).toBe('Run completed')
    })

    it('falls back to default text for undefined content', () => {
      sink.handle(completedEvent(undefined))
      expect(mocks.notificationInstances[0].options.body).toBe('Run completed')
    })

    it('collapses whitespace into single spaces', () => {
      sink.handle(completedEvent('line one\n\n  line   two'))
      expect(mocks.notificationInstances[0].options.body).toBe('line one line two')
    })

    it('does not truncate content at exactly 120 chars', () => {
      sink.handle(completedEvent('a'.repeat(120)))
      const result = mocks.notificationInstances[0].options.body
      expect(result).toBe('a'.repeat(120))
      expect(result.length).toBe(120)
    })

    it('truncates content at 121 chars with an ellipsis', () => {
      sink.handle(completedEvent('a'.repeat(121)))
      const result = mocks.notificationInstances[0].options.body
      expect(result).toBe(`${'a'.repeat(120)}…`)
      expect(result.length).toBe(121)
    })

    it('truncates content longer than 120 chars with an ellipsis', () => {
      sink.handle(completedEvent('a'.repeat(200)))
      const result = mocks.notificationInstances[0].options.body
      expect(result).toBe(`${'a'.repeat(120)}…`)
      expect(result.length).toBe(121)
    })

    it('truncates content on code-point boundaries', () => {
      sink.handle(completedEvent('😀'.repeat(121)))
      const result = mocks.notificationInstances[0].options.body
      expect(result).toBe(`${'😀'.repeat(120)}…`)
      expect(Array.from(result)).toHaveLength(121)
    })
  })
})
