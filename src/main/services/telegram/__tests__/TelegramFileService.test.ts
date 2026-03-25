import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramFileService } from '../TelegramFileService'
import type { TelegramInboundEnvelope } from '@main/services/hostAdapters/telegram'

const createEnvelope = (media: TelegramInboundEnvelope['media']): TelegramInboundEnvelope => ({
  updateId: 1,
  messageId: '10',
  chatId: '20',
  chatType: 'private',
  text: '',
  media,
  isMentioned: false,
  replyToBot: false,
  receivedAt: Date.now()
})

describe('TelegramFileService', () => {
  const service = new TelegramFileService()
  ;(service as any).logger = {
    info: vi.fn(),
    warn: vi.fn()
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('forces jpeg data urls for telegram photos when download content-type is application/octet-stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      arrayBuffer: async () => Uint8Array.from([0xff, 0xd8, 0xff]).buffer
    }))

    const result = await service.buildAttachmentContext({
      api: {
        getFile: vi.fn().mockResolvedValue({ file_path: 'photos/file_1' })
      },
      token: 'token'
    } as any, createEnvelope([
      {
        kind: 'photo',
        fileId: 'photo-1'
      }
    ]))

    expect(result.mediaCtx).toHaveLength(1)
    expect(result.mediaCtx[0]).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('prefers explicit image mime types for telegram image documents', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      arrayBuffer: async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer
    }))

    const result = await service.buildAttachmentContext({
      api: {
        getFile: vi.fn().mockResolvedValue({ file_path: 'documents/file_2' })
      },
      token: 'token'
    } as any, createEnvelope([
      {
        kind: 'document',
        fileId: 'doc-1',
        fileName: 'image.png',
        mimeType: 'image/png'
      }
    ]))

    expect(result.mediaCtx).toHaveLength(1)
    expect(result.mediaCtx[0]).toMatch(/^data:image\/png;base64,/)
  })
})
