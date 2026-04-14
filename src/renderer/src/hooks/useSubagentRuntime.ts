import { useEffect } from 'react'
import { subscribeRunEvents } from '@renderer/invoker/ipcInvoker'
import { useSubagentRuntimeStore } from '@renderer/store/subagentRuntime'
import type { RunEvent } from '@shared/run/events'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import { SUBAGENT_EVENTS } from '@shared/subagent/events'

export function useSubagentRuntime(chatUuid?: string | null): void {
  const upsert = useSubagentRuntimeStore(state => state.upsert)
  const markWaitingForConfirmation = useSubagentRuntimeStore(state => state.markWaitingForConfirmation)
  const clear = useSubagentRuntimeStore(state => state.clear)

  useEffect(() => {
    const unsubscribe = subscribeRunEvents((event: RunEvent) => {
      if (chatUuid && event.chatUuid && event.chatUuid !== chatUuid) {
        return
      }

      if (event.type === SUBAGENT_EVENTS.SUBAGENT_UPDATED) {
        upsert(event.payload.subagent)
        return
      }

      if (
        event.type === RUN_TOOL_EVENTS.TOOL_CONFIRMATION_REQUIRED
        && event.payload.agent?.kind === 'subagent'
        && event.payload.agent.subagentId
      ) {
        markWaitingForConfirmation({
          subagentId: event.payload.agent.subagentId,
          role: event.payload.agent.role,
          task: event.payload.agent.task
        })
      }
    })

    return () => {
      unsubscribe()
      clear()
    }
  }, [chatUuid, upsert, markWaitingForConfirmation, clear])
}
