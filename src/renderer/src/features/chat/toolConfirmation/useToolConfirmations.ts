import { useEffect } from 'react'
import { subscribeRunEvents } from '@renderer/infrastructure/ipc'
import { useToolConfirmationStore } from '@renderer/features/chat/state/toolConfirmationStore'
import type { RunEvent } from '@shared/run/events'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'

export function useToolConfirmations(chatUuid?: string | null): void {
  useEffect(() => {
    const store = useToolConfirmationStore.getState()
    store.activate(chatUuid ?? null)
    if (!chatUuid) return
    const unsubscribe = subscribeRunEvents((event: RunEvent) => {
      if (event.chatUuid !== chatUuid) return
      if (event.type === RUN_TOOL_EVENTS.TOOL_CONFIRMATION_REQUIRED || event.type === RUN_TOOL_EVENTS.TOOL_CONFIRMATION_RESOLVED) {
        store.apply(event.payload)
      }
    })
    // Subscribe first; versioned reconciliation prevents an older snapshot resurrecting a card.
    const hydrate = (): void => {
      void store.hydrate(chatUuid).catch(error => console.warn('[ToolConfirmation] Snapshot failed', error))
    }
    hydrate()
    window.addEventListener('focus', hydrate)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', hydrate)
      store.activate(null)
    }
  }, [chatUuid])
}
