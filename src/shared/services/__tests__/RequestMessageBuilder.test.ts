import { describe, expect, it } from 'vitest'
import { RequestMessageBuilder } from '../RequestMessageBuilder'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

describe('RequestMessageBuilder', () => {
  it('keeps only the latest user image payload and degrades older image history to text', () => {
    const messages = [
      {
        id: 1,
        body: {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,old', detail: 'auto' } },
            { type: 'text', text: 'first image' }
          ],
          segments: []
        }
      },
      {
        id: 2,
        body: {
          role: 'assistant',
          content: 'first reply',
          segments: []
        }
      },
      {
        id: 3,
        body: {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,new', detail: 'auto' } },
            { type: 'text', text: 'latest image' }
          ],
          segments: []
        }
      }
    ] as MessageEntity[]

    const result = new RequestMessageBuilder()
      .setMessages(messages)
      .build()

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: '[Previous image omitted from history]\nfirst image',
        segments: []
      },
      {
        role: 'assistant',
        content: 'first reply',
        segments: []
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,new', detail: 'auto' } },
          { type: 'text', text: 'latest image' }
        ],
        segments: []
      }
    ])
  })

  it('inserts ephemeral skills context after compressed summary and before the latest user message', () => {
    const messages = [
      {
        id: 1,
        body: {
          role: 'user',
          content: 'old user',
          segments: []
        }
      },
      {
        id: 2,
        body: {
          role: 'assistant',
          content: 'old assistant',
          segments: []
        }
      },
      {
        id: 3,
        body: {
          role: 'user',
          content: 'new user',
          segments: []
        }
      }
    ] as MessageEntity[]

    const result = new RequestMessageBuilder()
      .setMessages(messages)
      .setCompressionSummary({
        chatId: 1,
        chatUuid: 'chat-1',
        messageIds: [1, 2],
        startMessageId: 1,
        endMessageId: 2,
        summary: 'old summary',
        compressedAt: 1,
        status: 'active'
      })
      .setEphemeralContextMessages([{
        role: 'user',
        source: MESSAGE_SOURCE.SKILLS_CONTEXT,
        content: '<loaded_skills_context>Skill content</loaded_skills_context>',
        segments: []
      }])
      .build()

    expect(result.messages.map(message => message.content)).toEqual([
      '[Previous conversation summary (2 messages compressed)]\n\nold summary',
      '<loaded_skills_context>Skill content</loaded_skills_context>',
      'new user'
    ])
    expect(result.messages[1].source).toBe(MESSAGE_SOURCE.SKILLS_CONTEXT)
  })
})
