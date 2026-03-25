import { describe, expect, it } from 'vitest'
import { RequestMessageBuilder } from '../RequestMessageBuilder'

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
})
