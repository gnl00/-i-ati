export type AnchorMode =
  | 'latestMessage'
  | 'latestUserForAutoTop'
  | 'latestAssistantForAutoTop'
  | 'latestMinusOne'

export function resolveAnchorIndex(messages: MessageEntity[], mode: AnchorMode): number {
  const latestIndex = messages.length - 1
  if (latestIndex < 0) return -1

  if (mode === 'latestMessage') {
    return latestIndex
  }

  if (mode === 'latestMinusOne') {
    return latestIndex > 0 ? latestIndex - 1 : latestIndex
  }

  if (mode === 'latestAssistantForAutoTop') {
    for (let i = latestIndex; i >= 0; i--) {
      if (messages[i]?.body.role === 'assistant') {
        return i
      }
    }
    return latestIndex
  }

  for (let i = latestIndex; i >= 0; i--) {
    if (messages[i]?.body.role === 'user') {
      return i
    }
  }

  return latestIndex
}

export const CHAT_BASE_PADDING_END_PX = 12

export type ChatScrollMode = 'tail-follow' | 'anchor-lock' | 'manual'

export const resolveVirtualizerAnchorTo = (
  mode: ChatScrollMode
): 'start' | 'end' => mode === 'tail-follow' ? 'end' : 'start'

interface AnchorLockCorrectionGate {
  current: boolean
}

interface AnchorLockCorrectionInput {
  spacerChanged: boolean
  offset: number
}

export const consumeAnchorLockCorrection = (
  gate: AnchorLockCorrectionGate,
  {
    spacerChanged,
    offset
  }: AnchorLockCorrectionInput
) => {
  if (!gate.current || spacerChanged) return false
  gate.current = false
  return Math.abs(offset) > 1
}

type ScrollHintForMode =
  | { type: 'none' }
  | {
      type: 'conversation-switch' | 'user-sent' | 'search-result'
      chatUuid: string | null
    }

interface ResolveScrollModeForRenderInput {
  mode: ChatScrollMode
  modeChatUuid: string | null
  currentChatUuid: string | null
  scrollHint: ScrollHintForMode
}

export const resolveScrollModeForRender = ({
  mode,
  modeChatUuid,
  currentChatUuid,
  scrollHint
}: ResolveScrollModeForRenderInput): ChatScrollMode => {
  if (scrollHint.type !== 'none' && scrollHint.chatUuid === currentChatUuid) {
    if (scrollHint.type === 'user-sent') return 'anchor-lock'
    if (scrollHint.type === 'search-result') return 'manual'
    return 'tail-follow'
  }

  return modeChatUuid === currentChatUuid ? mode : 'tail-follow'
}

export const shouldKeepTailFollowOnUserIntent = (
  mode: ChatScrollMode,
  isAtEnd: boolean
) => mode === 'tail-follow' && isAtEnd

type ScrollPolicyItem =
  | {
      type: 'message'
      message: {
        id?: number
        body: {
          role: string
        }
      }
    }
  | {
      type: 'pending-assistant'
    }

export const resolveUserSentAnchorIndex = (
  items: readonly ScrollPolicyItem[],
  messageId?: number
) => {
  if (messageId !== undefined) {
    return items.findIndex(item => (
      item.type === 'message'
      && item.message.id === messageId
      && item.message.body.role === 'user'
    ))
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.type === 'message' && item.message.body.role === 'user') {
      return index
    }
  }

  return -1
}

interface AnchorLockSpacerInput {
  anchorStart: number
  latestEnd: number
  viewportHeight: number
  topOcclusionPx: number
  basePaddingEnd?: number
}

export const calculateAnchorLockBottomSpacer = ({
  anchorStart,
  latestEnd,
  viewportHeight,
  topOcclusionPx,
  basePaddingEnd = CHAT_BASE_PADDING_END_PX
}: AnchorLockSpacerInput) => {
  const tailHeight = Math.max(0, latestEnd - anchorStart)
  const availableViewportHeight = Math.max(0, viewportHeight - topOcclusionPx)
  return Math.max(basePaddingEnd, Math.ceil(availableViewportHeight - tailHeight))
}
