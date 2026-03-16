export interface ConversationStore {
  persistToolResultMessage(
    toolMsg: ChatMessage,
    chatId?: number,
    chatUuid?: string
  ): MessageEntity
}
