import type { Bot } from 'grammy'
import type { TelegramInboundEnvelope } from '../types'

type ToolMessage = { messageId?: number; text?: string; markup?: string; rank: number; queue: Promise<void> }

/** Serializes approval and execution presentation for each tool at each endpoint. */
export class TelegramToolMessages {
  private readonly messages = new Map<string, ToolMessage>()

  update(args: {
    bot: Bot
    envelope: Pick<TelegramInboundEnvelope, 'chatId' | 'threadId' | 'messageId'>
    submissionId: string
    toolCallId: string
    text: string
    rank: number
    keyboard?: Array<Array<{ text: string; callback_data: string }>>
  }): Promise<void> {
    const { bot, envelope } = args
    const key = JSON.stringify([args.submissionId, args.toolCallId, envelope.chatId, envelope.threadId ?? null])
    let entry = this.messages.get(key)
    if (!entry) {
      entry = { rank: 0, queue: Promise.resolve() }
      this.messages.set(key, entry)
    }
    const state = entry
    const task = state.queue.then(async () => {
      if (args.rank < state.rank) return
      state.rank = args.rank
      const keyboard = args.keyboard ?? []
      const markup = JSON.stringify(keyboard)
      if (state.text === args.text && state.markup === markup) return
      const options = { parse_mode: 'HTML' as const, reply_markup: { inline_keyboard: keyboard } }
      if (state.messageId === undefined) {
        const sent = await bot.api.sendMessage(Number(envelope.chatId), args.text, {
          ...options,
          ...(envelope.threadId ? { message_thread_id: Number(envelope.threadId) } : {}),
          ...(envelope.messageId ? { reply_parameters: { message_id: Number(envelope.messageId) } } : {})
        })
        state.messageId = sent.message_id
      } else {
        try {
          await bot.api.editMessageText(Number(envelope.chatId), state.messageId, args.text, options)
        } catch (error) {
          if (!String(error).toLowerCase().includes('message is not modified')) throw error
        }
      }
      state.text = args.text
      state.markup = markup
      // Keep the same bounded terminal history as the approval projection.
      const settled = [...this.messages.entries()].filter(([, value]) => value.rank >= 4 && value.text !== undefined)
      for (const [id] of settled.slice(0, Math.max(0, settled.length - 500))) this.messages.delete(id)
    })
    state.queue = task.catch(() => {})
    return task
  }
}
