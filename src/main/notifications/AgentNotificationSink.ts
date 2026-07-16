import { app, Notification } from 'electron'
import type { AgentEvent } from '../agent/runtime/events/AgentEvent'
import type { AgentEventSink } from '../agent/runtime/events/AgentEventSink'
import { isMainWindowForeground, showMainWindow } from '../main-window'

// Hold strong references so click/close listeners survive GC after the short-lived sink is collected.
const liveNotifications = new Set<Notification>()

/** Test-only: number of notifications currently retained to survive GC. */
export function liveNotificationCount(): number {
  return liveNotifications.size
}

export class AgentNotificationSink implements AgentEventSink {
  constructor(private readonly chatTitle?: string) {}

  handle(event: AgentEvent): void {
    try {
      if (isMainWindowForeground()) return

      switch (event.type) {
        case 'loop.completed':
          this.notify(this.completedTitle(), this.summarize(event.result.finalStep?.content), false)
          break
        case 'loop.failed':
          this.notify(this.failedTitle(), event.result.failure?.message || 'Error occurred during execution', true)
          break
        case 'loop.aborted':
          break
      }
    } catch {
      // Swallow notification errors to prevent aborting the event bus emit
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

  private notify(title: string, body: string, silent: boolean): void {
    if (!Notification.isSupported()) return

    const notification = new Notification({ title, body, silent })
    liveNotifications.add(notification)
    const release = () => liveNotifications.delete(notification)
    notification.on('click', () => {
      showMainWindow()
      release()
    })
    notification.on('close', release)
    notification.show()
    // The foreground gate in handle() ensures each completed/failed background run bumps the badge once.
    app.badgeCount = app.badgeCount + 1
  }

  private summarize(content?: string): string {
    const text = (content ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return 'Run completed'
    const codePoints = Array.from(text)
    return codePoints.length > 120 ? `${codePoints.slice(0, 120).join('')}…` : text
  }
}
