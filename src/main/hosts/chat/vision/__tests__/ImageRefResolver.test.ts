import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/app'),
    isReady: vi.fn(() => true)
  },
  shell: {},
  BrowserWindow: vi.fn(),
  session: {},
  ipcMain: {}
}))

vi.mock('@main/main-window', () => ({
  getMainWindow: vi.fn(() => null)
}))

import { ImageRefResolver } from '../ImageRefResolver'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

const imageMessage = {
  id: 101,
  chatUuid: 'chat-1',
  body: {
    role: 'user',
    content: [
      { type: 'text', text: 'first' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,one', detail: 'auto' } },
      { type: 'image_url', image_url: { url: 'https://cdn.example/image-two.png', detail: 'high' } }
    ],
    segments: []
  }
} as MessageEntity

const otherChatMessage = {
  id: 202,
  chatUuid: 'chat-2',
  body: {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,other', detail: 'auto' } }
    ],
    segments: []
  }
} as MessageEntity

const textMessage = {
  id: 303,
  chatUuid: 'chat-1',
  body: {
    role: 'user',
    content: 'text only',
    segments: []
  }
} as MessageEntity

const hiddenImageMessage = {
  id: 404,
  chatUuid: 'chat-1',
  body: {
    role: 'user',
    source: MESSAGE_SOURCE.VISION_OBSERVATION,
    content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,hidden', detail: 'auto' } }
    ],
    segments: []
  }
} as MessageEntity

const assistantImageMessage = {
  id: 505,
  chatUuid: 'chat-1',
  body: {
    role: 'assistant',
    content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,assistant', detail: 'auto' } }
    ],
    segments: []
  }
} as MessageEntity

describe('ImageRefResolver', () => {
  it('resolves one-based image ordinal refs', () => {
    const resolver = new ImageRefResolver({
      getMessagesByChatUuid: () => [imageMessage]
    })

    expect(resolver.resolve('chat-1', ['message:101#image:2'])).toEqual([{
      ref: 'message:101#image:2',
      sourceRef: 'message:101',
      messageId: 101,
      imageIndex: 2,
      url: 'https://cdn.example/image-two.png'
    }])
  })

  it('expands message refs to all image_url parts', () => {
    const resolver = new ImageRefResolver({
      getMessagesByChatUuid: () => [imageMessage]
    })

    expect(resolver.resolve('chat-1', ['message:101']).map(image => image.ref)).toEqual([
      'message:101#image:1',
      'message:101#image:2'
    ])
  })

  it('rejects invalid, missing, out-of-range, and text-only refs', () => {
    const resolver = new ImageRefResolver({
      getMessagesByChatUuid: () => [imageMessage, textMessage]
    })

    expect(() => resolver.resolve('chat-1', ['bad-ref'])).toThrow('Invalid image ref')
    expect(() => resolver.resolve('chat-1', ['message:999'])).toThrow('was not found')
    expect(() => resolver.resolve('chat-1', ['message:101#image:3'])).toThrow('out of range')
    expect(() => resolver.resolve('chat-1', ['message:303'])).toThrow('without image_url parts')
  })

  it('requires current chat scope for ref lookup', () => {
    const resolver = new ImageRefResolver({
      getMessagesByChatUuid: () => [imageMessage]
    })

    expect(() => resolver.resolve(undefined, ['message:101'])).toThrow('chat_uuid is required')
    expect(() => resolver.resolve('chat-2', ['message:101'])).toThrow('belongs to chat_uuid')
  })

  it('detects out-of-chat rows returned by the storage layer', () => {
    const resolver = new ImageRefResolver({
      getMessagesByChatUuid: () => [otherChatMessage]
    })

    expect(() => resolver.resolve('chat-1', ['message:202'])).toThrow('belongs to chat_uuid')
  })

  it('rejects hidden and non-user image messages', () => {
    const resolver = new ImageRefResolver({
      getMessagesByChatUuid: () => [hiddenImageMessage, assistantImageMessage]
    })

    expect(() => resolver.resolve('chat-1', ['message:404'])).toThrow('hidden message')
    expect(() => resolver.resolve('chat-1', ['message:505'])).toThrow('non-user message')
  })

  it('supports url and raw_data passthrough through resolveImages', () => {
    const resolver = new ImageRefResolver({
      getMessagesByChatUuid: () => []
    })

    expect(resolver.resolveImages([
      { url: 'https://cdn.example/direct.png' },
      { raw_data: 'data:image/png;base64,raw' }
    ], 'chat-1')).toEqual([
      {
        ref: 'https://cdn.example/direct.png',
        success: true,
        images: [{
          ref: 'https://cdn.example/direct.png',
          url: 'https://cdn.example/direct.png'
        }]
      },
      {
        ref: 'input:2',
        success: true,
        images: [{
          ref: 'input:2',
          url: 'data:image/png;base64,raw'
        }]
      }
    ])
  })
})
