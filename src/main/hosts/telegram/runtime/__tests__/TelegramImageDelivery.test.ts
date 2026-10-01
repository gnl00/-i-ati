import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Bot } from 'grammy'
import type { ImageShowResult } from '@shared/tools/image/types'
const read = vi.hoisted(() => vi.fn())
vi.mock('@main/services/images/ImageAssetService', () => ({
  imageAssetService: { read },
}))
import { TelegramRenderResponder } from '../TelegramRenderResponder'

const image = (): ImageShowResult => ({
  kind: 'image_show',
  success: true,
  image: {
    assetId: `${'a'.repeat(64)}.png`,
    url: `image-asset://snapshot/${'a'.repeat(64)}.png`,
    mimeType: 'image/png',
    width: 400,
    height: 300,
    size: 100,
  },
  caption: 'Preview',
})

describe('Telegram image delivery', () => {
  const api = {
    sendPhoto: vi.fn(),
    sendDocument: vi.fn(),
    sendMessage: vi.fn(),
    editMessageText: vi.fn(),
  }
  const make = (): {
    responder: TelegramRenderResponder
    update: ReturnType<typeof vi.fn>
  } => {
    const responder = new TelegramRenderResponder({
      bot: { api } as unknown as Bot,
      submissionId: 'run-1',
      envelope: {
        updateId: 1,
        messageId: '2',
        chatId: '123',
        chatType: 'supergroup',
        threadId: '99',
        text: '',
        media: [],
        isMentioned: true,
        replyToBot: false,
        receivedAt: 1,
      },
    })
    const update = vi.fn(() => true)
    responder.connectToolResultUpdates(update)
    return { responder, update }
  }
  const send = (
    responder: TelegramRenderResponder,
    content = image(),
  ): Promise<void> =>
    responder.handle({
      type: 'host.tool.result.available',
      timestamp: 1,
      result: {
        status: 'success',
        stepId: 'step',
        toolCallId: 'call',
        toolCallIndex: 0,
        toolName: 'image_show',
        content,
      },
    })
  beforeEach(() => {
    vi.clearAllMocks()
    read.mockResolvedValue(Buffer.from('image'))
    api.sendPhoto.mockResolvedValue({ message_id: 10 })
    api.sendDocument.mockResolvedValue({ message_id: 11 })
    api.sendMessage.mockResolvedValue({ message_id: 12 })
  })
  it('persists the attempt before upload, sends to the current topic and saves a receipt once', async () => {
    const { responder, update } = make()
    api.sendPhoto.mockImplementationOnce(async () => {
      expect(update.mock.calls[0][1]).toMatchObject({
        telegram: { state: 'sending' },
      })
      return { message_id: 10 }
    })
    await send(responder)
    await send(responder)
    expect(api.sendPhoto).toHaveBeenCalledTimes(1)
    expect(api.sendPhoto.mock.calls[0][0]).toBe(123)
    expect(api.sendPhoto.mock.calls[0][2]).toMatchObject({
      message_thread_id: 99,
      reply_parameters: { message_id: 2 },
      caption: 'Preview',
    })
    expect(update.mock.calls.at(-1)?.[1]).toMatchObject({
      telegram: {
        state: 'sent',
        messageId: 10,
        method: 'photo',
        chatId: '123',
        threadId: '99',
      },
    })
  })
  it('does not send when a durable receipt already exists', async () => {
    const { responder, update } = make()
    update.mockReturnValue(false)
    await send(responder)
    expect(read).not.toHaveBeenCalled()
    expect(api.sendPhoto).not.toHaveBeenCalled()
  })
  it('uses a document for images outside photo limits', async () => {
    const { responder, update } = make()
    const result = image()
    result.image.width = 12000
    await send(responder, result)
    expect(api.sendPhoto).not.toHaveBeenCalled()
    expect(api.sendDocument).toHaveBeenCalledTimes(1)
    expect(update.mock.calls.at(-1)?.[1]).toMatchObject({
      telegram: { method: 'document', state: 'sent' },
    })
  })
  it('falls back only after an explicit photo-format rejection', async () => {
    const { responder } = make()
    api.sendPhoto.mockRejectedValueOnce({
      error_code: 400,
      description: 'PHOTO_INVALID_DIMENSIONS',
    })
    await send(responder)
    expect(api.sendDocument).toHaveBeenCalledTimes(1)
  })
  it.each([
    [new Error('network timeout'), 'unknown'],
    [{ error_code: 403, description: 'Forbidden' }, 'failed'],
  ])('records %s as %s without a second upload', async (error, state) => {
    const { responder, update } = make()
    api.sendPhoto.mockRejectedValueOnce(error)
    await send(responder)
    await send(responder)
    expect(api.sendPhoto).toHaveBeenCalledTimes(1)
    expect(api.sendDocument).not.toHaveBeenCalled()
    expect(update.mock.calls.at(-1)?.[1]).toMatchObject({ telegram: { state } })
    expect(api.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringMatching(/Image delivery/),
      expect.anything(),
    )
  })
  it('never re-uploads if saving the success receipt fails', async () => {
    const { responder, update } = make()
    update.mockImplementation((_id: string, value: unknown) => {
      if ((value as ImageShowResult).telegram?.state === 'sent')
        throw new Error('storage failed')
      return true
    })
    await send(responder)
    await send(responder)
    expect(api.sendPhoto).toHaveBeenCalledTimes(1)
    expect(api.sendDocument).not.toHaveBeenCalled()
  })
  it('keeps the local image on read failure and reports failed delivery', async () => {
    const { responder, update } = make()
    read.mockRejectedValueOnce(new Error('missing'))
    await send(responder)
    expect(api.sendPhoto).not.toHaveBeenCalled()
    expect(update.mock.calls.at(-1)?.[1]).toMatchObject({
      image: image().image,
      telegram: { state: 'failed' },
    })
  })
})
