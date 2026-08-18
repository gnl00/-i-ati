import React, { useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion'
import { toast } from 'sonner'
import { useToolUserQuestionStore } from '@renderer/features/chat/state/toolUserQuestionStore'
import { cn } from '@renderer/shared/lib/utils'
import type { ToolUserQuestionAnswer } from '@shared/tools/userQuestion'
import { UserQuestionCard } from './UserQuestionCard'

interface ChatInputUserQuestionProps {
  className?: string
}

export const ChatInputUserQuestion: React.FC<ChatInputUserQuestionProps> = ({ className }) => {
  const shouldReduceMotion = useReducedMotion()
  const pendingRequest = useToolUserQuestionStore(state => state.pendingRequests[0] ?? null)
  const pendingCount = useToolUserQuestionStore(state => state.pendingRequests.length)
  const submit = useToolUserQuestionStore(state => state.submit)
  const cancel = useToolUserQuestionStore(state => state.cancel)
  const [settlingInteractionId, setSettlingInteractionId] = React.useState<string | null>(null)

  const isSettling = Boolean(
    pendingRequest && settlingInteractionId === pendingRequest.interactionId
  )
  const motionTransition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }

  const handleSubmit = useCallback(async (answers: ToolUserQuestionAnswer[]) => {
    if (!pendingRequest) return
    setSettlingInteractionId(pendingRequest.interactionId)
    try {
      const result = await submit(pendingRequest, answers)
      if (!result.ok) {
        toast.error(result.message || 'The question could not be submitted')
      }
    } finally {
      setSettlingInteractionId(current => current === pendingRequest.interactionId ? null : current)
    }
  }, [pendingRequest, submit])

  const handleCancel = useCallback(async () => {
    if (!pendingRequest) return
    setSettlingInteractionId(pendingRequest.interactionId)
    try {
      const result = await cancel(pendingRequest, 'user_cancelled')
      if (!result.ok) {
        toast.error(result.message || 'The question could not be cancelled')
      }
    } finally {
      setSettlingInteractionId(current => current === pendingRequest.interactionId ? null : current)
    }
  }, [cancel, pendingRequest])

  return (
    <AnimatePresence initial={false} mode="wait">
      {pendingRequest && (
        <motion.div
          key={pendingRequest.interactionId}
          data-testid="chat-input-user-question-frame"
          className={cn(
            'grid max-h-[clamp(220px,52vh,420px)] min-h-0 shrink px-2 pb-1',
            className
          )}
          initial={{
            y: shouldReduceMotion ? 0 : 6,
            scale: shouldReduceMotion ? 1 : 0.985,
            gridTemplateRows: '0fr'
          }}
          animate={{ y: 0, scale: 1, gridTemplateRows: '1fr' }}
          exit={{
            y: shouldReduceMotion ? 0 : 4,
            scale: shouldReduceMotion ? 1 : 0.99,
            gridTemplateRows: '0fr'
          }}
          transition={motionTransition}
          style={{ overflow: 'hidden' }}
        >
          <div className="max-h-[clamp(220px,52vh,420px)] min-h-0 overflow-hidden">
            <UserQuestionCard
              request={pendingRequest}
              pendingCount={pendingCount}
              disabled={isSettling}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              className="max-h-[clamp(220px,52vh,420px)]"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
