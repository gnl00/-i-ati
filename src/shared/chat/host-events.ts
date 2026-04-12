export const CHAT_HOST_EVENTS = {
  CHAT_READY: 'chat.ready',
  MESSAGES_LOADED: 'messages.loaded',
  CHAT_UPDATED: 'chat.updated'
} as const

export type ChatHostEventPayloads = {
  'chat.ready': {
    chatEntity: ChatEntity
    workspacePath: string
  }
  'messages.loaded': { messages: MessageEntity[] }
  'chat.updated': { chatEntity: ChatEntity }
}
