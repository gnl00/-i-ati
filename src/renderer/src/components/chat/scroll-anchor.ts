export type AnchorMode = 'latestMessage' | 'latestUserForAutoTop' | 'latestMinusOne'

export function resolveAnchorIndex(messages: MessageEntity[], mode: AnchorMode): number {
  const latestIndex = messages.length - 1
  if (latestIndex < 0) return -1

  if (mode === 'latestMessage') {
    return latestIndex
  }

  if (mode === 'latestMinusOne') {
    return latestIndex > 0 ? latestIndex - 1 : latestIndex
  }

  for (let i = latestIndex; i >= 0; i--) {
    if (messages[i]?.body.role === 'user') {
      return i
    }
  }

  return latestIndex
}
