import { useEffect } from 'react'
import { subscribeRunEvents } from '@renderer/infrastructure/ipc'
import { useSubagentRuntimeStore } from '@renderer/features/subagents/subagentRuntimeStore'
import type { RunEvent } from '@shared/run/events'
import { SUBAGENT_EVENTS } from '@shared/subagent/events'

export function useSubagentRuntime(chatUuid?: string | null): void {
  const upsert = useSubagentRuntimeStore(state => state.upsert)
  const clear = useSubagentRuntimeStore(state => state.clear)

  useEffect(() => {
    const unsubscribe = subscribeRunEvents((event: RunEvent) => {
      if (event.chatUuid !== chatUuid) {
        return
      }

      if (event.type === SUBAGENT_EVENTS.SUBAGENT_UPDATED) {
        upsert(event.payload.subagent)
        return
      }
    })

    return () => {
      unsubscribe()
      clear()
    }
  }, [chatUuid, upsert, clear])
}
