import type { Bot } from 'grammy'
import { extractContentFromSegments } from '@main/services/agentCore/execution/parser/segment-content'
import type { TelegramInboundEnvelope } from '@main/services/hostAdapters/telegram'
import type { ChatRunEventEnvelope, ChatRunEventPayloads } from '@shared/chatRun/events'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import { formatTelegramRichText } from './telegram-rich-text'

const STREAM_UPDATE_THROTTLE_MS = 400

type TelegramRunResponderArgs = {
  bot: Bot
  envelope: TelegramInboundEnvelope
  logger?: {
    info?: (event: string, payload?: Record<string, unknown>) => void
    warn?: (event: string, payload?: Record<string, unknown>) => void
    error?: (event: string, payload?: Record<string, unknown>) => void
  }
}

export class TelegramRunResponder {
  private readonly bot: Bot
  private readonly envelope: TelegramInboundEnvelope
  private readonly logger?: TelegramRunResponderArgs['logger']
  private latestText = ''
  private latestAssistantMessage?: MessageEntity
  private sentMessageId?: number
  private lastSentText = ''
  private finalized = false
  private finalRenderCommitted = false
  private flushTimer?: NodeJS.Timeout
  private queue: Promise<void> = Promise.resolve()

  constructor(args: TelegramRunResponderArgs) {
    this.bot = args.bot
    this.envelope = args.envelope
    this.logger = args.logger
  }

  handleEvent(event: ChatRunEventEnvelope): Promise<void> {
    if (this.finalized && event.type !== CHAT_RUN_EVENTS.RUN_COMPLETED) {
      return this.queue
    }

    this.queue = this.queue
      .then(async () => {
        await this.handleEventInternal(event)
      })
      .catch((error) => {
        this.logger?.error?.('telegram.run_responder.event_failed', {
          updateId: this.envelope.updateId,
          error: error instanceof Error ? error.message : String(error)
        })
      })

    return this.queue
  }

  private async handleEventInternal(event: ChatRunEventEnvelope): Promise<void> {
    switch (event.type) {
      case CHAT_RUN_EVENTS.MESSAGE_UPDATED: {
        const { message } = event.payload as ChatRunEventPayloads['message.updated']
        if (message.body.role !== 'assistant') {
          return
        }

        this.latestAssistantMessage = message
        const nextText = this.extractText(message)
        if (!nextText || nextText === this.latestText) {
          return
        }

        this.latestText = nextText
        this.scheduleFlush()
        return
      }

      case CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED: {
        const { message } = event.payload as ChatRunEventPayloads['stream.preview.updated']
        if (message.body.role !== 'assistant') {
          return
        }

        this.latestAssistantMessage = message
        const nextText = this.extractText(message)
        if (!nextText || nextText === this.latestText) {
          return
        }

        this.latestText = nextText
        this.scheduleFlush()
        return
      }

      case CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED:
        return

      case CHAT_RUN_EVENTS.RUN_COMPLETED:
        this.finalized = true
        this.clearScheduledFlush()
        await this.flushLatestText({ final: true })
        return

      case CHAT_RUN_EVENTS.RUN_FAILED:
      case CHAT_RUN_EVENTS.RUN_ABORTED:
        this.finalized = true
        this.clearScheduledFlush()
        return

      default:
        return
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      this.queue = this.queue
        .then(async () => {
          await this.flushLatestText({ final: false })
        })
        .catch((error) => {
          this.logger?.error?.('telegram.run_responder.flush_failed', {
            updateId: this.envelope.updateId,
            error: error instanceof Error ? error.message : String(error)
          })
        })
    }, STREAM_UPDATE_THROTTLE_MS)
  }

  private clearScheduledFlush(): void {
    if (!this.flushTimer) {
      return
    }

    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
  }

  private async flushLatestText(args: { final: boolean }): Promise<void> {
    const text = this.latestText.trim()
    if (!text) {
      return
    }

    if (!args.final && text === this.lastSentText) {
      return
    }

    if (!this.sentMessageId) {
      const sent = await this.bot.api.sendMessage(Number(this.envelope.chatId), text, {
        ...(this.envelope.threadId ? { message_thread_id: Number(this.envelope.threadId) } : {}),
        ...(this.envelope.messageId ? { reply_parameters: { message_id: Number(this.envelope.messageId) } } : {})
      })
      this.sentMessageId = sent.message_id
      this.lastSentText = text
      this.finalRenderCommitted = args.final
      this.attachSentMessageId()
      this.logger?.info?.('telegram.run_responder.message_sent', {
        updateId: this.envelope.updateId,
        chatId: this.envelope.chatId,
        messageId: sent.message_id,
        final: args.final
      })
      return
    }

    if (args.final) {
      if (this.finalRenderCommitted) {
        return
      }
      const formatted = formatTelegramRichText(text)
      await this.editMessage({
        text: formatted.text,
        parseMode: formatted.parseMode,
        fallbackText: formatted.fallbackText
      })
      this.lastSentText = text
      this.finalRenderCommitted = true
      return
    }

    await this.editMessage({ text })
    this.lastSentText = text
  }

  private async editMessage(args: {
    text: string
    parseMode?: 'HTML'
    fallbackText?: string
  }): Promise<void> {
    if (!this.sentMessageId) {
      return
    }

    try {
      await this.bot.api.editMessageText(
        Number(this.envelope.chatId),
        this.sentMessageId,
        args.text,
        {
          ...(args.parseMode ? { parse_mode: args.parseMode } : {})
        }
      )
    } catch (error) {
      if (args.parseMode && args.fallbackText) {
        await this.bot.api.editMessageText(
          Number(this.envelope.chatId),
          this.sentMessageId,
          args.fallbackText
        )
        return
      }

      throw error
    }
  }

  private extractText(message: MessageEntity): string {
    const fromSegments = message.body.segments?.length
      ? extractContentFromSegments(message.body.segments)
      : ''
    const fromContent = typeof message.body.content === 'string'
      ? message.body.content
      : ''

    return (fromSegments || fromContent || '').trim()
  }

  private attachSentMessageId(): void {
    if (!this.sentMessageId || !this.latestAssistantMessage) {
      return
    }

    this.latestAssistantMessage.body.host = {
      type: 'telegram',
      direction: 'outbound',
      peerId: this.envelope.chatId,
      peerType: this.envelope.chatType,
      threadId: this.envelope.threadId,
      messageId: String(this.sentMessageId)
    }

    if (this.envelope.messageId) {
      this.latestAssistantMessage.body.host = {
        ...this.latestAssistantMessage.body.host,
        replyToMessageId: this.envelope.messageId
      }
    }
  }
}
