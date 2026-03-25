import { describe, expect, it } from 'vitest'
import { buildTelegramInputText } from '../telegram-input-text'
import type { TelegramInboundEnvelope } from '../types'

describe('telegram-input-text', () => {
  const baseEnvelope: TelegramInboundEnvelope = {
    updateId: 1,
    messageId: '2',
    chatId: '3',
    chatType: 'private',
    fromUserId: '4',
    username: 'alice',
    displayName: 'Alice',
    text: '',
    media: [],
    isMentioned: false,
    replyToBot: false,
    receivedAt: Date.now()
  }

  it('uses caption text as the primary prompt for photo messages', () => {
    const text = buildTelegramInputText({
      ...baseEnvelope,
      text: 'What is shown in this image?',
      media: [{
        kind: 'photo',
        fileId: 'photo-1',
        width: 800,
        height: 800
      }]
    })

    expect(text).toBe('What is shown in this image?')
  })

  it('adds a minimal image prompt when a photo has no caption', () => {
    const text = buildTelegramInputText({
      ...baseEnvelope,
      media: [{
        kind: 'photo',
        fileId: 'photo-1',
        width: 800,
        height: 800
      }]
    })

    expect(text).toBe('Please analyze the attached image.')
  })

  it('adds a plural image prompt when multiple images are attached', () => {
    const text = buildTelegramInputText({
      ...baseEnvelope,
      media: [
        { kind: 'photo', fileId: 'photo-1', width: 800, height: 800 },
        { kind: 'document', fileId: 'doc-1', mimeType: 'image/png' }
      ]
    })

    expect(text).toBe('Please analyze the attached images.')
  })

  it('adds a minimal document prompt when a non-image document has no caption', () => {
    const text = buildTelegramInputText({
      ...baseEnvelope,
      media: [{
        kind: 'document',
        fileId: 'doc-1',
        fileName: 'notes.pdf',
        mimeType: 'application/pdf'
      }]
    })

    expect(text).toBe('Please review the attached document.')
  })

  it('appends extracted text document blocks after the prompt', () => {
    const text = buildTelegramInputText({
      ...baseEnvelope,
      media: [{
        kind: 'document',
        fileId: 'doc-1',
        fileName: 'notes.txt',
        mimeType: 'text/plain'
      }]
    }, [
      'Attached document: notes.txt\n\n--- BEGIN TELEGRAM DOCUMENT ---\nhello\n--- END TELEGRAM DOCUMENT ---'
    ])

    expect(text).toContain('Please review the attached document.')
    expect(text).toContain('--- BEGIN TELEGRAM DOCUMENT ---')
  })
})
