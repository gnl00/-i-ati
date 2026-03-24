import { useEffect } from 'react'
import { subscribeChatRunEvents } from '@renderer/invoker/ipcInvoker'
import { useSubagentRuntimeStore } from '@renderer/store/subagentRuntime'
import { CHAT_RUN_EVENTS, type ChatRunEvent } from '@shared/chatRun/events'

export function useSubagentRuntime(chatUuid?: string | null): void {
  const upsert = useSubagentRuntimeStore(state => state.upsert)
  const markWaitingForConfirmation = useSubagentRuntimeStore(state => state.markWaitingForConfirmation)
  const clear = useSubagentRuntimeStore(state => state.clear)

  useEffect(() => {
    const unsubscribe = subscribeChatRunEvents((event: ChatRunEvent) => {
      if (chatUuid && event.chatUuid && event.chatUuid !== chatUuid) {
        return
      }

      if (event.type === CHAT_RUN_EVENTS.SUBAGENT_UPDATED) {
        upsert(event.payload.subagent)
        return
      }

      if (
        event.type === CHAT_RUN_EVENTS.TOOL_EXEC_REQUIRES_CONFIRMATION
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
