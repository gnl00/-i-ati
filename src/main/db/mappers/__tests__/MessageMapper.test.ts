import { describe, expect, it } from 'vitest'
import {
  patchMessageRowUiState,
  toMessageEntity,
  toMessageInsertRow,
  toMessageRow
} from '../MessageMapper'

describe('messageMapper', () => {
  it('maps a message entity into insert and update rows', () => {
    const message: MessageEntity = {
      id: 4,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: 'hello'
      } as ChatMessage,
      tokens: 12
    }

    expect(toMessageInsertRow(message)).toEqual({
      chat_id: 1,
      chat_uuid: 'chat-1',
      body: JSON.stringify(message.body),
      tokens: 12
    })
    expect(toMessageRow(message)).toEqual({
      id: 4,
      chat_id: 1,
      chat_uuid: 'chat-1',
      body: JSON.stringify(message.body),
      tokens: 12
    })
  })

  it('maps a row back into a message entity and patches ui state', () => {
    const row = {
      id: 4,
      chat_id: 1,
      chat_uuid: 'chat-1',
      body: JSON.stringify({
        role: 'assistant',
        content: 'hello'
      }),
      tokens: 12
    }

    expect(toMessageEntity(row)).toEqual({
      id: 4,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: 'hello'
      },
      tokens: 12
    })

    expect(patchMessageRowUiState(row, { typewriterCompleted: true })).toEqual({
      ...row,
      body: JSON.stringify({
        role: 'assistant',
        content: 'hello',
        typewriterCompleted: true
      })
    })
  })

  it('normalizes legacy segments without segmentId when reading and writing rows', () => {
    const legacyMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      segments: [
        {
          type: 'reasoning',
          content: 'thinking',
          timestamp: 1
        } as ReasoningSegment,
        {
          type: 'toolCall',
          name: 'read_file',
          content: { toolName: 'read_file', status: 'completed' },
          timestamp: 2
        } as ToolCallSegment
      ]
    }

    const insertRow = toMessageInsertRow({
      chatUuid: 'chat-legacy',
      body: legacyMessage
    } as MessageEntity)
    const insertBody = JSON.parse(insertRow.body) as ChatMessage

    expect(insertBody.segments?.map((segment) => segment.segmentId)).toEqual([
      'db-message:chat-legacy:reasoning:0',
      'db-message:chat-legacy:toolCall:1'
    ])

    const entity = toMessageEntity({
      id: 4,
      chat_id: 1,
      chat_uuid: 'chat-1',
      body: JSON.stringify(legacyMessage),
      tokens: 12
    })

    expect(entity.body.segments?.map((segment) => segment.segmentId)).toEqual([
      'db-message:4:reasoning:0',
      'db-message:4:toolCall:1'
    ])
  })
})
