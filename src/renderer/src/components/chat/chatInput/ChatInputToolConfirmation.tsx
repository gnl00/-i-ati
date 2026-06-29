import React, { useCallback, useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion'
import { CommandConfirmation } from '../chatMessage/assistant-message/CommandConfirmation'
import { buildToolConfirmationRequest } from '../toolConfirmation/commandConfirmationPresenter'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'

export const ChatInputToolConfirmation: React.FC = () => {
  const shouldReduceMotion = useReducedMotion()
  const pendingToolConfirm = useToolConfirmationStore(state => state.pendingRequests[0] ?? null)
  const pendingToolConfirmCount = useToolConfirmationStore(state => state.pendingRequests.length)
  const confirm = useToolConfirmationStore(state => state.confirm)
  const cancel = useToolConfirmationStore(state => state.cancel)
  const [settlingToolCallId, setSettlingToolCallId] = React.useState<string | null>(null)

  const toolConfirmationRequest = useMemo(() => {
    return buildToolConfirmationRequest({
      pendingToolConfirm,
      pendingToolConfirmCount
    })
  }, [pendingToolConfirm, pendingToolConfirmCount])

  const isSettling = Boolean(pendingToolConfirm && settlingToolCallId === pendingToolConfirm.toolCallId)
  const motionTransition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
  const exitTransition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.14, ease: [0.25, 1, 0.5, 1] }

  const handleConfirmCommand = useCallback(async () => {
    if (!pendingToolConfirm) return Promise.resolve()
    setSettlingToolCallId(pendingToolConfirm.toolCallId)
    try {
      await confirm(pendingToolConfirm.toolCallId)
    } finally {
      setSettlingToolCallId(current => (
        current === pendingToolConfirm.toolCallId ? null : current
      ))
    }
  }, [confirm, pendingToolConfirm])

  const handleCancelCommand = useCallback(async () => {
    if (!pendingToolConfirm) return Promise.resolve()
    setSettlingToolCallId(pendingToolConfirm.toolCallId)
    try {
      await cancel('user abort', pendingToolConfirm.toolCallId)
    } finally {
      setSettlingToolCallId(current => (
        current === pendingToolConfirm.toolCallId ? null : current
      ))
    }
  }, [cancel, pendingToolConfirm])

  return (
    <AnimatePresence initial={false} mode="wait">
      {pendingToolConfirm && toolConfirmationRequest && (
        <motion.div
          key={pendingToolConfirm.toolCallId}
          className="grid shrink-0 px-2 pb-1"
          initial={{
            opacity: 0,
            y: shouldReduceMotion ? 0 : 6,
            scale: shouldReduceMotion ? 1 : 0.985,
            gridTemplateRows: '0fr'
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            gridTemplateRows: '1fr'
          }}
          exit={{
            opacity: 0,
            y: shouldReduceMotion ? 0 : 4,
            scale: shouldReduceMotion ? 1 : 0.99,
            gridTemplateRows: '0fr'
          }}
          transition={motionTransition}
          style={{ overflow: 'hidden' }}
        >
          <motion.div
            className="min-h-0 overflow-hidden"
            exit={{ opacity: 0 }}
            transition={exitTransition}
          >
            <CommandConfirmation
              request={toolConfirmationRequest}
              onConfirm={handleConfirmCommand}
              onCancel={handleCancelCommand}
              disabled={isSettling}
              className="my-0 max-h-[30vh] overflow-y-auto"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
