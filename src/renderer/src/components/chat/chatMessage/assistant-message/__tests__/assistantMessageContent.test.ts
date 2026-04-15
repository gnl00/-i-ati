import { describe, expect, it } from 'vitest'
import {
  extractAssistantRegeneratePayload,
  findLatestRegeneratableUserMessage,
  getAssistantCopyContent
} from '../model/assistantMessageContent'

describe('assistantMessageContent', () => {
  it('extracts regenerate payload from multimodal user content', () => {
    const payload = extractAssistantRegeneratePayload({
      role: 'user',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image_url', image_url: { url: 'img-1' } },
        { type: 'text', text: 'world' }
      ],
      segments: []
    })

    expect(payload).toEqual({
      text: 'hello\nworld',
      images: ['img-1']
    })
  })

  it('prefers text segments when building assistant copy content', () => {
    expect(getAssistantCopyContent({
      role: 'assistant',
      content: 'fallback',
      segments: [
        {
          type: 'text',
          segmentId: 'text-1',
          content: 'hello ',
          timestamp: 1
        },
        {
          type: 'text',
          segmentId: 'text-2',
          content: 'world',
          timestamp: 2
        }
      ]
    })).toBe('hello world')
  })

  it('finds the latest regeneratable user message and skips sourced rows', () => {
    const latest = findLatestRegeneratableUserMessage([
      {
        id: 1,
        body: {
          role: 'user',
          content: 'scheduled',
          source: 'schedule',
          segments: []
        }
      } as MessageEntity,
      {
        id: 2,
        body: {
          role: 'user',
          content: 'normal',
          segments: []
        }
      } as MessageEntity
    ])

    expect(latest?.content).toBe('normal')
  })
})
