import {
  deleteMessage,
  getMessageById,
  getMessagesByChatId,
  getMessagesByChatUuid,
  saveMessage,
  updateMessage
} from '@renderer/db/MessageRepository'

export interface MessagePersistence {
  saveMessage: (message: MessageEntity) => Promise<number>
  updateMessage: (message: MessageEntity) => Promise<void>
  deleteMessage: (messageId: number) => Promise<void>
  getMessageById: (id: number) => Promise<MessageEntity | undefined>
  getMessagesByChatId: (chatId: number) => Promise<MessageEntity[]>
  getMessagesByChatUuid: (chatUuid: string) => Promise<MessageEntity[]>
}

class MessagePersistenceService implements MessagePersistence {
  async saveMessage(message: MessageEntity): Promise<number> {
    return await saveMessage(message)
  }

  async updateMessage(message: MessageEntity): Promise<void> {
    return await updateMessage(message)
  }

  async deleteMessage(messageId: number): Promise<void> {
    return await deleteMessage(messageId)
  }

  async getMessageById(id: number): Promise<MessageEntity | undefined> {
    return await getMessageById(id)
  }

  async getMessagesByChatId(chatId: number): Promise<MessageEntity[]> {
    return await getMessagesByChatId(chatId)
  }

  async getMessagesByChatUuid(chatUuid: string): Promise<MessageEntity[]> {
    return await getMessagesByChatUuid(chatUuid)
  }
}

export const messagePersistence = new MessagePersistenceService()
