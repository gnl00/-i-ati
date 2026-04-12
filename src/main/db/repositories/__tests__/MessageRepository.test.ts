import { describe, expect, it, vi } from 'vitest'
import { MessageRepository } from '../MessageRepository'

const createMessageRepo = (initialRows: any[] = []) => {
  const rows = [...initialRows]

  return {
    rows,
    insertMessage: vi.fn((row: any) => {
      const next = { ...row, id: rows.length + 1 }
      rows.push(next)
      return next.id
    }),
    getAllMessages: vi.fn(() => [...rows]),
    getMessageById: vi.fn((id: number) => rows.find(row => row.id === id)),
    getMessagesByChatId: vi.fn((chatId: number) => rows.filter(row => row.chat_id === chatId)),
    getMessagesByChatUuid: vi.fn((chatUuid: string) => rows.filter(row => row.chat_uuid === chatUuid)),
    getMessageByIds: vi.fn((ids: number[]) => rows.filter(row => ids.includes(row.id))),
    updateMessage: vi.fn((nextRow: any) => {
      const index = rows.findIndex(row => row.id === nextRow.id)
      if (index >= 0) {
        rows[index] = { ...nextRow }
      }
    }),
    deleteMessage: vi.fn((id: number) => {
      const index = rows.findIndex(row => row.id === id)
      if (index >= 0) {
        rows.splice(index, 1)
      }
    })
  }
}

const createChatRepo = () => ({
  updateMessageCount: vi.fn()
})

describe('MessageRepository', () => {
  it('increments chat msg_count when saving a user or assistant message', () => {
    const messageRepo = createMessageRepo()
    const chatRepo = createChatRepo()
    const repository = new MessageRepository({
      hasDb: () => true,
      getChatRepo: () => chatRepo as any,
      getMessageRepo: () => messageRepo as any
    })

    const messageId = repository.saveMessage({
      chatId: 7,
      chatUuid: 'chat-7',
      body: {
        role: 'assistant',
        content: 'hello',
        segments: []
      }
    } as MessageEntity)

    expect(messageId).toBe(1)
    expect(chatRepo.updateMessageCount).toHaveBeenCalledWith(7, 1)
  })

  it('does not touch chat msg_count for tool messages', () => {
    const messageRepo = createMessageRepo()
    const chatRepo = createChatRepo()
    const repository = new MessageRepository({
      hasDb: () => true,
      getChatRepo: () => chatRepo as any,
      getMessageRepo: () => messageRepo as any
    })

    repository.saveMessage({
      chatId: 7,
      chatUuid: 'chat-7',
      body: {
        role: 'tool',
        content: 'tool output',
        segments: []
      }
    } as MessageEntity)

    expect(chatRepo.updateMessageCount).not.toHaveBeenCalled()
  })

  it('reconciles chat msg_count when updating a message role or chat binding', () => {
    const messageRepo = createMessageRepo([{
      id: 1,
      chat_id: 7,
      chat_uuid: 'chat-7',
      body: JSON.stringify({
        role: 'tool',
        content: 'tool output',
        segments: []
      }),
      tokens: null
    }])
    const chatRepo = createChatRepo()
    const repository = new MessageRepository({
      hasDb: () => true,
      getChatRepo: () => chatRepo as any,
      getMessageRepo: () => messageRepo as any
    })

    repository.updateMessage({
      id: 1,
      chatId: 9,
      chatUuid: 'chat-9',
      body: {
        role: 'assistant',
        content: 'assistant output',
        segments: []
      }
    } as MessageEntity)

    expect(chatRepo.updateMessageCount).toHaveBeenCalledTimes(1)
    expect(chatRepo.updateMessageCount).toHaveBeenCalledWith(9, 1)
  })

  it('decrements chat msg_count when deleting a counted message', () => {
    const messageRepo = createMessageRepo([{
      id: 1,
      chat_id: 7,
      chat_uuid: 'chat-7',
      body: JSON.stringify({
        role: 'user',
        content: 'hello',
        segments: []
      }),
      tokens: null
    }])
    const chatRepo = createChatRepo()
    const repository = new MessageRepository({
      hasDb: () => true,
      getChatRepo: () => chatRepo as any,
      getMessageRepo: () => messageRepo as any
    })

    repository.deleteMessage(1)

    expect(chatRepo.updateMessageCount).toHaveBeenCalledWith(7, -1)
  })
})
