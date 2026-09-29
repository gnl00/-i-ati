import { describe, expect, it } from 'vitest'
import { RequestMessageBuilder } from '../RequestMessageBuilder'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

describe('RequestMessageBuilder', () => {
  it.each(['telegram', 'telegram_delivery'])('excludes %s delivery copies without breaking tool pairs or removing real Telegram turns', source => {
    const call = (id: string): NonNullable<ChatMessage['toolCalls']>[number] => ({ id, type: 'function', function: { name: 'test', arguments: '{}' } })
    const messages = [
      { body: { role: 'user', source: 'telegram', content: 'request', segments: [] } },
      { body: { role: 'assistant', model: 'model', source: 'telegram', host: { direction: 'outbound' }, content: 'reply', toolCalls: [call('a'), call('b')], segments: [] } },
      { body: { role: 'tool', toolCallId: 'a', content: 'result a', segments: [] } },
      { body: { role: 'assistant', source, host: { direction: 'outbound' }, content: 'delivery copy', segments: [] } },
      { body: { role: 'tool', toolCallId: 'b', content: 'result b', segments: [] } },
      { body: { role: 'user', content: 'continue', segments: [] } }
    ] as MessageEntity[]
    const result = new RequestMessageBuilder().setMessages(messages).build()
    expect(result.chatMessages.map(message => message.content)).toEqual(['request', 'reply', 'result a', 'result b', 'continue'])
    expect(result.chatMessages[1].toolCalls).toHaveLength(2)
    expect(messages).toHaveLength(6)
  })

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

    expect(result.chatMessages).toEqual([
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

    expect(result.chatMessages.map(message => message.content)).toEqual([
      '[Previous conversation summary (2 messages compressed)]\n\nold summary',
      '<loaded_skills_context>Skill content</loaded_skills_context>',
      'new user'
    ])
    expect(result.chatMessages[0].source).toBe(MESSAGE_SOURCE.COMPRESSION_SUMMARY)
    expect(result.chatMessages[1].source).toBe(MESSAGE_SOURCE.SKILLS_CONTEXT)
  })

  it('omits raw image data from compressed summary messages', () => {
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
        summary: `summary copied data:image/png;base64,secret-image-data and ${'a'.repeat(180)}`,
        compressedAt: 1,
        status: 'active'
      })
      .build()

    const compressedContent = result.chatMessages[0].content as string
    expect(compressedContent).toContain('[Image data omitted]')
    expect(compressedContent).not.toContain('data:image')
    expect(compressedContent).not.toContain('secret-image-data')
    expect(compressedContent).not.toContain('a'.repeat(180))
  })
})
