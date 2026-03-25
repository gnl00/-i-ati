import { describe, expect, it } from 'vitest'
import { TelegramUpdateMapper } from '../TelegramUpdateMapper'

describe('TelegramUpdateMapper', () => {
  it('maps text messages and resolves direct mentions for the current bot', () => {
    const envelope = TelegramUpdateMapper.fromContext({
      update: { update_id: 42 },
      message: {
        message_id: 7,
        message_thread_id: 9,
        text: '@ati_bot hello there',
        entities: [{ type: 'mention', offset: 0, length: 8 }],
        chat: {
          id: 1001,
          type: 'supergroup',
          title: 'Team Chat'
        },
        from: {
          id: 2002,
          username: 'alice',
          first_name: 'Alice'
        },
        reply_to_message: {
          from: { is_bot: true }
        }
      }
    } as any, 'ati_bot')

    expect(envelope).toEqual({
      updateId: 42,
      messageId: '7',
      chatId: '1001',
      chatType: 'supergroup',
      threadId: '9',
      fromUserId: '2002',
      username: 'alice',
      displayName: 'Alice',
      text: '@ati_bot hello there',
      media: [],
      isMentioned: true,
      replyToBot: true,
      receivedAt: expect.any(Number)
    })
  })

  it('returns null for non-text messages', () => {
    const envelope = TelegramUpdateMapper.fromContext({
      update: { update_id: 1 },
      message: {
        message_id: 2,
        chat: {
          id: 3,
          type: 'private'
        }
      }
    } as any, 'ati_bot')

    expect(envelope).toBeNull()
  })

  it('maps photo and document metadata even when no text body is present', () => {
    const envelope = TelegramUpdateMapper.fromContext({
      update: { update_id: 99 },
      message: {
        message_id: 12,
        caption: '',
        caption_entities: [],
        chat: {
          id: 3,
          type: 'private'
        },
        from: {
          id: 4,
          first_name: 'Bob'
        },
        photo: [
          {
            file_id: 'photo-small',
            file_unique_id: 'photo-small-u',
            width: 100,
            height: 100
          },
          {
            file_id: 'photo-large',
            file_unique_id: 'photo-large-u',
            width: 1280,
            height: 720,
            file_size: 4096
          }
        ],
        document: {
          file_id: 'doc-id',
          file_unique_id: 'doc-unique',
          file_name: 'notes.pdf',
          mime_type: 'application/pdf',
          file_size: 1024
        }
      }
    } as any, 'ati_bot')

    expect(envelope).toEqual({
      updateId: 99,
      messageId: '12',
      chatId: '3',
      chatType: 'private',
      threadId: undefined,
      fromUserId: '4',
      username: undefined,
      displayName: 'Bob',
      text: '',
      media: [
        {
          kind: 'photo',
          fileId: 'photo-large',
          fileUniqueId: 'photo-large-u',
          fileSize: 4096,
          width: 1280,
          height: 720
        },
        {
          kind: 'document',
          fileId: 'doc-id',
          fileUniqueId: 'doc-unique',
          fileName: 'notes.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024
        }
      ],
      isMentioned: false,
      replyToBot: false,
      receivedAt: expect.any(Number)
    })
  })
})
