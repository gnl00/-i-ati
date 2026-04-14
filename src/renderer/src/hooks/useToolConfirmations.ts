import { useEffect } from 'react'
import { subscribeRunEvents } from '@renderer/invoker/ipcInvoker'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'
import type { RunEvent } from '@shared/run/events'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'

export function useToolConfirmations(chatUuid?: string | null): void {
  const enqueue = useToolConfirmationStore(state => state.enqueue)
  const clear = useToolConfirmationStore(state => state.clear)

  useEffect(() => {
    const unsubscribe = subscribeRunEvents((event: RunEvent) => {
      if (chatUuid && event.chatUuid && event.chatUuid !== chatUuid) {
        return
      }

      if (event.type === RUN_TOOL_EVENTS.TOOL_CONFIRMATION_REQUIRED) {
        enqueue(event.payload)
      }
    })

    return () => {
      unsubscribe()
      clear()
    }
  }, [chatUuid, enqueue, clear])
}
