import React, { useCallback, useMemo } from 'react'
import { CommandConfirmation } from '../chatMessage/assistant-message/CommandConfirmation'
import { buildCommandConfirmationRequest } from '../toolConfirmation/commandConfirmationPresenter'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'

export const ChatInputToolConfirmation: React.FC = () => {
  const pendingToolConfirm = useToolConfirmationStore(state => state.pendingRequests[0] ?? null)
  const pendingToolConfirmCount = useToolConfirmationStore(state => state.pendingRequests.length)
  const confirm = useToolConfirmationStore(state => state.confirm)
  const cancel = useToolConfirmationStore(state => state.cancel)

  const commandConfirmationRequest = useMemo(() => {
    if (pendingToolConfirm?.name !== 'execute_command') {
      return undefined
    }

    return buildCommandConfirmationRequest({
      pendingToolConfirm,
      pendingToolConfirmCount
    })
  }, [pendingToolConfirm, pendingToolConfirmCount])

  const handleConfirmCommand = useCallback(() => {
    if (!pendingToolConfirm) return Promise.resolve()
    return confirm(pendingToolConfirm.toolCallId)
  }, [confirm, pendingToolConfirm])

  const handleCancelCommand = useCallback(() => {
    if (!pendingToolConfirm) return Promise.resolve()
    return cancel('user abort', pendingToolConfirm.toolCallId)
  }, [cancel, pendingToolConfirm])

  if (!commandConfirmationRequest) {
    return null
  }

  return (
    <div className="shrink-0 px-2 pb-1">
      <CommandConfirmation
        request={commandConfirmationRequest}
        onConfirm={handleConfirmCommand}
        onCancel={handleCancelCommand}
        className="my-0 max-h-[30vh] overflow-y-auto"
      />
    </div>
  )
}
