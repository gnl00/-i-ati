import { useEffect } from 'react'
import { subscribeChatRunEvents } from '@renderer/invoker/ipcInvoker'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'
import type { ChatRunEvent } from '@shared/chatRun/events'

export function useToolConfirmations(chatUuid?: string | null): void {
  const setPending = useToolConfirmationStore(state => state.setPending)
  const clear = useToolConfirmationStore(state => state.clear)

  useEffect(() => {
    const unsubscribe = subscribeChatRunEvents((event: ChatRunEvent) => {
      if (chatUuid && event.chatUuid && event.chatUuid !== chatUuid) {
        return
      }

      if (event.type === 'tool.exec.requires_confirmation') {
        setPending(event.payload)
      }
    })

    return () => {
      unsubscribe()
      clear()
    }
  }, [chatUuid, setPending, clear])
}
