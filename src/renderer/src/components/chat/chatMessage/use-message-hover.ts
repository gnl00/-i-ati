import { useCallback, useState } from 'react'

export interface UseMessageHoverReturn {
  userMessageOperationIdx: number
  assistantMessageHovered: boolean
  onMouseHoverUsrMsg: (idx: number) => void
  onMouseHoverAssistantMsg: (hovered: boolean) => void
}

/**
 * Hook to manage hover state for user and assistant message operations.
 * Tracks which user message is hovered and whether assistant message is hovered.
 */
export function useMessageHover(): UseMessageHoverReturn {
  const [userMessageOperationIdx, setUserMessageOperationIdx] = useState<number>(-1)
  const [assistantMessageHovered, setAssistantMessageHovered] = useState<boolean>(false)

  const onMouseHoverUsrMsg = useCallback((idx: number) => {
    setUserMessageOperationIdx(idx)
  }, [])

  const onMouseHoverAssistantMsg = useCallback((hovered: boolean) => {
    setAssistantMessageHovered(hovered)
  }, [])

  return {
    userMessageOperationIdx,
    assistantMessageHovered,
    onMouseHoverUsrMsg,
    onMouseHoverAssistantMsg
  }
}
