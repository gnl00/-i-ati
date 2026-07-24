import { app, Notification } from 'electron'
import type { AgentEvent } from '../agent/runtime/events/AgentEvent'
import type { AgentEventSink } from '../agent/runtime/events/AgentEventSink'
import { isMainWindowForeground, showMainWindow } from '../main-window'

// Hold strong references so click/close listeners survive GC after the short-lived sink is collected.
const liveNotifications = new Set<Notification>()
const notifiedOccurrenceKeys = new Set<string>()
const notifiedOccurrenceOrder: string[] = []
const MAX_OCCURRENCE_KEYS = 1000

export type TerminalRunFailureNotification = {
  title?: string
  body: string
  occurrenceKey?: string
}

/** Test-only: number of notifications currently retained to survive GC. */
export function liveNotificationCount(): number {
  return liveNotifications.size
}

export function notifyTerminalRunFailure({
  title,
  body,
  occurrenceKey
}: TerminalRunFailureNotification): void {
  new AgentNotificationSink(title, {
    notifyOnFailure: true,
    ...(occurrenceKey ? { occurrenceKey } : {})
  }).notifyTerminalFailure(body)
}

export class AgentNotificationSink implements AgentEventSink {
  private hasNotified = false

  constructor(
    private readonly chatTitle?: string,
    private readonly options: {
      notifyOnFailure?: boolean
      occurrenceKey?: string
    } = {}
  ) {}

  handle(event: AgentEvent): void {
    try {
      switch (event.type) {
        case 'loop.completed':
          this.notifyOnce(
            this.completedTitle(),
            this.summarize(event.result.finalStep?.content),
            false
          )
          break
        case 'loop.failed':
          this.notifyTerminalFailure(event.result.failure?.message)
          break
        case 'loop.aborted':
          break
      }
    } catch {
      // Swallow notification errors to prevent aborting the event bus emit
    }
  }

  notifyTerminalFailure(message?: string): void {
    try {
      if (this.options.notifyOnFailure === false) return
      this.notifyOnce(
        this.failedTitle(),
        message || 'Error occurred during execution',
        true
      )
    } catch {
      // Keep direct scheduler fallback failures isolated from run finalization.
    }
  }

  private completedTitle(): string {
    const t = this.chatTitle?.trim()
    return t ? t : '@i run completed'
  }

  private failedTitle(): string {
    const t = this.chatTitle?.trim()
    return t ? t : '@i run failed'
  }

  private notify(title: string, body: string, silent: boolean): boolean {
    if (!Notification.isSupported()) return false

    const notification = new Notification({ title, body, silent })
    liveNotifications.add(notification)
    const release = (): void => {
      liveNotifications.delete(notification)
    }
    notification.on('click', () => {
      showMainWindow()
      release()
    })
    notification.on('close', release)
    notification.show()
    // The shared notifyOnce gate ensures each completed/failed background run bumps the badge once.
    app.badgeCount = app.badgeCount + 1
    return true
  }

  private notifyOnce(title: string, body: string, silent: boolean): void {
    if (this.hasNotified) return
    if (
      this.options.occurrenceKey
      && notifiedOccurrenceKeys.has(this.options.occurrenceKey)
    ) return
    if (isMainWindowForeground()) return

    this.hasNotified = this.notify(title, body, silent)
    this.rememberOccurrence()
  }

  private summarize(content?: string): string {
    const text = (content ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return 'Run completed'
    const codePoints = Array.from(text)
    return codePoints.length > 120 ? `${codePoints.slice(0, 120).join('')}…` : text
  }

  private rememberOccurrence(): void {
    const key = this.options.occurrenceKey
    if (!key || !this.hasNotified || notifiedOccurrenceKeys.has(key)) return
    notifiedOccurrenceKeys.add(key)
    notifiedOccurrenceOrder.push(key)
    while (notifiedOccurrenceOrder.length > MAX_OCCURRENCE_KEYS) {
      const expired = notifiedOccurrenceOrder.shift()
      if (expired) notifiedOccurrenceKeys.delete(expired)
    }
  }
}
