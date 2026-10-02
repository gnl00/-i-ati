import { describe, expect, it, vi } from 'vitest'
vi.mock('@main/services/images/ImageAssetService', () => ({ imageAssetService: { read: vi.fn() } }))
import type { Bot } from 'grammy'
import { TelegramRenderResponder } from '../TelegramRenderResponder'
import { TelegramToolMessages } from '../TelegramToolMessages'

type UpdateArgs = Parameters<TelegramToolMessages['update']>[0]
const setup = (): {
  update: (patch?: Partial<UpdateArgs>) => Promise<void>
  sendMessage: ReturnType<typeof vi.fn>
  editMessageText: ReturnType<typeof vi.fn>
  bot: Bot
  messages: TelegramToolMessages
} => {
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 42 })
  const editMessageText = vi.fn().mockResolvedValue(true)
  const bot = { api: { sendMessage, editMessageText } } as unknown as Bot
  const messages = new TelegramToolMessages()
  const update = (patch: Partial<UpdateArgs> = {}): Promise<void> => messages.update({
    bot, envelope: { chatId: '123', threadId: '9', messageId: '55' },
    submissionId: 'run-1', toolCallId: 'call-1', text: 'needs approval', rank: 1,
    keyboard: [[{ text: 'Approve', callback_data: 'approve' }]], ...patch
  })
  return { update, sendMessage, editMessageText, bot, messages }
}

describe('TelegramToolMessages', () => {
  it('shares the approval message with the real execution responder', async () => {
    const { update, sendMessage, editMessageText, bot, messages } = setup()
    const responder = new TelegramRenderResponder({
      bot, toolMessages: messages, submissionId: 'run-1',
      envelope: {
        updateId: 1, chatId: '123', threadId: '9', messageId: '55',
        chatType: 'private', text: '', media: [], isMentioned: false, replyToBot: false, receivedAt: 1
      }
    })
    await update()
    await update({ text: 'approved', rank: 2, keyboard: [] })
    await responder.handle({
      type: 'host.tool.detected', timestamp: 1, stepId: 'step-1', toolCallIndex: 0,
      toolCallId: 'call-1', toolName: 'exec', toolArgs: 'pnpm run typecheck:node'
    })
    await responder.handle({
      type: 'host.tool.execution.started', timestamp: 2, stepId: 'step-1', toolCallIndex: 0,
      toolCallId: 'call-1', toolName: 'exec'
    })
    await responder.handle({
      type: 'host.tool.result.available', timestamp: 3,
      result: { status: 'success', stepId: 'step-1', toolCallIndex: 0, toolCallId: 'call-1', toolName: 'exec' }
    })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(editMessageText.mock.calls.map(([, id]) => id)).toEqual([42, 42, 42])
    expect(editMessageText.mock.lastCall?.[2]).toBe('<blockquote>tool exec done</blockquote>\n<blockquote expandable>pnpm run typecheck:node</blockquote>')
  })

  it('reuses approval for execution and ignores late approval and running updates', async () => {
    const { update, sendMessage, editMessageText } = setup()
    await update()
    await update({ text: 'running', rank: 3, keyboard: [] })
    await update({ text: 'approved', rank: 2, keyboard: [] })
    await update({ text: 'done', rank: 4, keyboard: [] })
    await update({ text: 'running', rank: 3, keyboard: [] })
    await update({ text: 'done', rank: 4, keyboard: [] })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(editMessageText.mock.calls.map(([, id, text]) => [id, text])).toEqual([[42, 'running'], [42, 'done']])
    expect(editMessageText.mock.lastCall?.[3]).toEqual({ parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } })
  })

  it('keeps denial visible when an aborted execution result follows', async () => {
    const { update, sendMessage, editMessageText } = setup()
    await update()
    await update({ text: 'denied', rank: 5, keyboard: [] })
    await update({ text: 'aborted', rank: 4, keyboard: [] })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(editMessageText).toHaveBeenCalledTimes(1)
    expect(editMessageText.mock.lastCall?.[2]).toBe('denied')
  })

  it('serializes execution arriving during approval delivery', async () => {
    const { update, sendMessage, editMessageText } = setup()
    let resolve!: (value: { message_id: number }) => void
    sendMessage.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const approval = update()
    await Promise.resolve()
    const running = update({ text: 'running', rank: 3, keyboard: [] })
    resolve({ message_id: 99 })
    await Promise.all([approval, running])
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(editMessageText.mock.lastCall?.slice(0, 3)).toEqual([123, 99, 'running'])
  })

  it('isolates concurrent tools, runs, chats and topics', async () => {
    const { update, sendMessage } = setup()
    await Promise.all([
      update(), update({ toolCallId: 'call-2' }), update({ submissionId: 'run-2' }),
      update({ envelope: { chatId: '456', threadId: '9', messageId: '' } }),
      update({ envelope: { chatId: '123', threadId: '10', messageId: '' } })
    ])
    expect(sendMessage).toHaveBeenCalledTimes(5)
  })

  it('retries failed sends and edits without creating another delivered message', async () => {
    const { update, sendMessage, editMessageText } = setup()
    sendMessage.mockRejectedValueOnce(new Error('offline'))
    await expect(update()).rejects.toThrow('offline')
    await update()
    editMessageText.mockRejectedValueOnce(new Error('offline'))
    await expect(update({ text: 'done', rank: 4, keyboard: [] })).rejects.toThrow('offline')
    await update({ text: 'done', rank: 4, keyboard: [] })
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(editMessageText).toHaveBeenCalledTimes(2)
  })

  it('accepts Telegram message-not-modified responses', async () => {
    const { update, editMessageText } = setup()
    await update()
    editMessageText.mockRejectedValueOnce(new Error('Bad Request: message is not modified'))
    await update({ text: 'done', rank: 4, keyboard: [] })
    await update({ text: 'done', rank: 4, keyboard: [] })
    expect(editMessageText).toHaveBeenCalledTimes(1)
  })
})
