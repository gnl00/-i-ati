import { describe, expect, it, vi } from 'vitest'
vi.mock('@main/services/images/ImageAssetService', () => ({ imageAssetService: { read: vi.fn() } }))
import { Bot } from 'grammy'
import { deliverTelegramText } from '../TelegramTextDelivery'
import { TelegramRenderResponder } from '@main/hosts/telegram/runtime'
import { RUN_STATES } from '@shared/run/lifecycle-events'

describe('Telegram Bot API 10.3 protocol', () => {
  it('serializes rich sends, edits and drafts using the real SDK and receives Stop updates', async () => {
    const bot = new Bot('123:local-protocol-test', { botInfo: {
      id: 123, is_bot: true, first_name: 'Test', username: 'test_bot',
      can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, supports_join_request_queries: false, can_manage_bots: false
    } })
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = []
    bot.api.config.use(async (_previous, method, payload) => {
      calls.push({ method, payload })
      return { ok: true, result: method.startsWith('send') && !method.endsWith('Draft')
        ? { message_id: 99, date: 1, chat: { id: 456, type: 'private' } }
        : true } as never
    })
    const messages = await deliverTelegramText(bot, { chatId: '456' }, '# Heading')
    await deliverTelegramText(bot, { chatId: '456' }, '# Updated', messages)
    expect(calls[0]).toMatchObject({ method: 'sendRichMessage', payload: { chat_id: 456, rich_message: { html: '<h1>Heading</h1>' } } })
    expect(calls[1]).toMatchObject({ method: 'editMessageText', payload: { chat_id: 456, message_id: 99, rich_message: { html: '<h1>Updated</h1>' } } })
    expect(calls[1].payload.text).toBeUndefined()

    const responder = new TelegramRenderResponder({ bot, envelope: {
      updateId: 1, chatId: '456', chatType: 'private', messageId: '11', text: '',
      media: [], isMentioned: false, replyToBot: false, receivedAt: 1
    } })
    await responder.handle({ type: 'host.lifecycle.updated', state: RUN_STATES.STREAMING, timestamp: 1 })
    const draft = calls.find(call => call.method === 'sendRichMessageDraft')!
    expect(draft.payload).toMatchObject({ chat_id: 456, rich_message: { html: '<tg-thinking>Thinking...</tg-thinking>' }, can_stop: true, keep_on_stop: true })
    let stopped = false
    bot.on('stopped_message_generation', ctx => {
      stopped = responder.stopDraft(ctx.update.stopped_message_generation.draft_id)
    })
    await bot.handleUpdate({ update_id: 2, stopped_message_generation: {
      chat: { id: 456, type: 'private', first_name: 'User' }, draft_id: Number(draft.payload.draft_id)
    } })
    expect(stopped).toBe(true)
    await responder.handle({ type: 'host.lifecycle.updated', state: RUN_STATES.ABORTED, timestamp: 2 })
    expect(calls.at(-1)).toMatchObject({ method: 'sendMessage', payload: { chat_id: 456, text: 'Generation stopped.', reply_parameters: { message_id: 11 } } })
    responder.dispose()
  })
})
