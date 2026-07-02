import { describe, expect, it } from 'vitest'
import { AvailableImagesContextProvider } from '../AvailableImagesContextProvider'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

const imageMessage = (
  id: number,
  text: string,
  url: string,
  extraUrl?: string,
  source?: string
): MessageEntity => ({
  id,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url, detail: 'auto' } },
      ...(extraUrl ? [{ type: 'image_url' as const, image_url: { url: extraUrl, detail: 'auto' as const } }] : []),
      { type: 'text', text }
    ],
    ...(source ? { source } : {}),
    segments: []
  }
})

describe('AvailableImagesContextProvider', () => {
  it('builds available image refs from the uncompressed message window', () => {
    const provider = new AvailableImagesContextProvider()
    const context = provider.build([
      imageMessage(1, 'old image', 'data:image/png;base64,old'),
      {
        id: 2,
        chatId: 1,
        chatUuid: 'chat-1',
        body: {
          role: 'assistant',
          content: 'reply',
          segments: []
        }
      },
      imageMessage(3, 'new image', 'data:image/png;base64,new')
    ], {
      chatId: 1,
      chatUuid: 'chat-1',
      messageIds: [1, 2],
      startMessageId: 1,
      endMessageId: 2,
      summary: 'old summary',
      compressedAt: 1,
      status: 'active'
    })

    expect(context?.source).toBe(MESSAGE_SOURCE.AVAILABLE_IMAGES_CONTEXT)
    expect(context?.content).toContain('ref="message:3#image:1"')
    expect(context?.content).toContain('user_text="new image"')
    expect(context?.content).not.toContain('message:1#image:1')
    expect(context?.content).not.toContain('data:image')
  })

  it('returns null when the compressed window has no image refs', () => {
    const provider = new AvailableImagesContextProvider()
    const context = provider.build([
      imageMessage(1, 'old image', 'data:image/png;base64,old'),
      {
        id: 2,
        chatId: 1,
        chatUuid: 'chat-1',
        body: {
          role: 'user',
          content: 'latest text',
          segments: []
        }
      }
    ], {
      chatId: 1,
      chatUuid: 'chat-1',
      messageIds: [1],
      startMessageId: 1,
      endMessageId: 1,
      summary: 'old summary',
      compressedAt: 1,
      status: 'active'
    })

    expect(context).toBeNull()
  })

  it('emits one-based refs for multi-image messages', () => {
    const provider = new AvailableImagesContextProvider()
    const context = provider.build([
      imageMessage(
        10,
        'two images',
        'data:image/png;base64,one',
        'data:image/png;base64,two'
      )
    ], null)

    expect(context?.content).toContain('ref="message:10#image:1"')
    expect(context?.content).toContain('ref="message:10#image:2"')
  })

  it('excludes hidden messages from available image refs', () => {
    const provider = new AvailableImagesContextProvider()
    const context = provider.build([
      imageMessage(10, 'hidden image', 'data:image/png;base64,hidden', undefined, MESSAGE_SOURCE.VISION_OBSERVATION)
    ], null)

    expect(context).toBeNull()
  })
})
