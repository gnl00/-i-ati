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
  getAllChats: vi.fn(() => []),
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

  it('searches chats by title and message content with aggregated result metadata', () => {
    const messageRepo = createMessageRepo([
      {
        id: 11,
        chat_id: 1,
        chat_uuid: 'chat-1',
        body: JSON.stringify({
          role: 'assistant',
          createdAt: 1000,
          content: 'implementation details are ready',
          segments: [
            {
              type: 'text',
              segmentId: 'seg-1',
              content: 'Implementation details are ready for review',
              timestamp: 1
            }
          ]
        }),
        tokens: null
      },
      {
        id: 12,
        chat_id: 2,
        chat_uuid: 'chat-2',
        body: JSON.stringify({
          role: 'assistant',
          createdAt: 2000,
          content: 'General note',
          segments: [
            {
              type: 'text',
              segmentId: 'seg-2',
              content: 'A separate implementation note lives here',
              timestamp: 2
            }
          ]
        }),
        tokens: null
      }
    ])
    const chatRepo = {
      ...createChatRepo(),
      getAllChats: vi.fn(() => [
        {
          id: 1,
          uuid: 'chat-1',
          title: 'Implementation Plan',
          msg_count: 8,
          model_account_id: null,
          model_model_id: null,
          workspace_path: null,
          user_instruction: null,
          create_time: 100,
          update_time: 200
        },
        {
          id: 2,
          uuid: 'chat-2',
          title: 'Release Notes',
          msg_count: 4,
          model_account_id: null,
          model_model_id: null,
          workspace_path: null,
          user_instruction: null,
          create_time: 100,
          update_time: 150
        }
      ])
    }
    const repository = new MessageRepository({
      hasDb: () => true,
      getChatRepo: () => chatRepo as any,
      getMessageRepo: () => messageRepo as any
    })

    const results = repository.searchChats({ query: 'implementation' })

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      chat: {
        id: 1,
        uuid: 'chat-1',
        title: 'Implementation Plan'
      },
      matchSource: 'title+message',
      matchedMessageId: 11,
      matchedTimestamp: 1000,
      messageHitCount: 1
    })
    expect(results[0].snippet).toContain('Implementation details')
    expect(results[1]).toMatchObject({
      chat: {
        id: 2,
        uuid: 'chat-2',
        title: 'Release Notes'
      },
      matchSource: 'message',
      matchedMessageId: 12,
      matchedTimestamp: 2000,
      messageHitCount: 1
    })
  })
})
