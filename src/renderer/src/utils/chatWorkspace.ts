export function getChatFromList({
  chatUuid,
  chatId,
  chatList
}: {
  chatUuid?: string
  chatId?: number
  chatList: ChatEntity[]
}): ChatEntity | undefined {
  if (!chatList || chatList.length === 0) {
    return undefined
  }

  let currentChat: ChatEntity | undefined

  if (chatUuid) {
    currentChat = chatList.find(chat => chat.uuid === chatUuid)
  }

  if (!currentChat && chatId !== undefined) {
    currentChat = chatList.find(chat => chat.id === chatId)
  }

  return currentChat
}

export function getChatWorkspacePath({
  chatUuid,
  chatId,
  chatList
}: {
  chatUuid?: string
  chatId?: number
  chatList: ChatEntity[]
}): string | undefined {
  return getChatFromList({ chatUuid, chatId, chatList })?.workspacePath
}
