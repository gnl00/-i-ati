import type { Bot } from 'grammy'
import type { TelegramInboundEnvelope } from '@main/hosts/telegram'
import {
  HostRenderStateController,
  type HostRenderEvent,
  type HostRenderEventSink
} from '@main/hosts/shared/render'
import { RUN_STATES } from '@shared/run/lifecycle-events'
import { TelegramTransportStateController } from './TelegramTransportStateController'

const STREAM_UPDATE_THROTTLE_MS = 400

type TelegramRenderResponderArgs = {
  bot: Bot
  envelope: TelegramInboundEnvelope
  logger?: {
    info?: (event: string, payload?: Record<string, unknown>) => void
    warn?: (event: string, payload?: Record<string, unknown>) => void
    error?: (event: string, payload?: Record<string, unknown>) => void
  }
}

export class TelegramRenderResponder implements HostRenderEventSink {
  private readonly bot: Bot
  private readonly envelope: TelegramInboundEnvelope
  private readonly logger?: TelegramRenderResponderArgs['logger']
  private readonly renderState = new HostRenderStateController()
  private readonly transport = new TelegramTransportStateController()
  private latestText = ''
  private sentMessageId?: number
  private lastSentText = ''
  private finalized = false
  private finalRenderCommitted = false
  private flushTimer?: NodeJS.Timeout
  private queue: Promise<void> = Promise.resolve()

  constructor(args: TelegramRenderResponderArgs) {
    this.bot = args.bot
    this.envelope = args.envelope
    this.logger = args.logger
  }

  handle(event: HostRenderEvent): Promise<void> {
    if (this.finalized && event.type !== 'host.lifecycle.updated') {
      return this.queue
    }

    this.queue = this.queue
      .then(async () => {
        await this.handleEventInternal(event)
      })
      .catch((error) => {
        this.logger?.error?.('telegram.render_responder.event_failed', {
          updateId: this.envelope.updateId,
          error: error instanceof Error ? error.message : String(error)
        })
      })

    return this.queue
  }

  private async handleEventInternal(event: HostRenderEvent): Promise<void> {
    switch (event.type) {
      case 'host.committed.updated':
      case 'host.preview.updated':
        this.renderState.apply(event)
        this.scheduleTransportFlush()
        return

      case 'host.preview.cleared':
        this.captureStickyPreviewBase()
        this.renderState.apply(event)
        return

      case 'host.lifecycle.updated':
        if (event.state === RUN_STATES.COMPLETED) {
          this.finalized = true
          this.clearScheduledFlush()
          this.updateLatestTransportState()
          await this.flushLatestText({ final: true })
          return
        }

        if (event.state === RUN_STATES.FAILED || event.state === RUN_STATES.ABORTED) {
          this.finalized = true
          this.clearScheduledFlush()
          return
        }

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
          this.logger?.error?.('telegram.render_responder.flush_failed', {
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

  private scheduleTransportFlush(): void {
    this.updateLatestTransportState()
    if (!this.latestText || this.latestText === this.lastSentText) {
      return
    }
    this.scheduleFlush()
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
      const sent = await this.sendMessage({ text })
      this.sentMessageId = sent.message_id
      this.lastSentText = text
      this.transport.markSent()
      this.finalRenderCommitted = args.final
      if (args.final) {
        this.transport.consumeStickyPreviewIfRendered(text)
      }
      this.logger?.info?.('telegram.render_responder.message_sent', {
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
      await this.editMessage({ text })
      this.lastSentText = text
      this.transport.markSent()
      this.finalRenderCommitted = true
      this.transport.consumeStickyPreviewIfRendered(text)
      return
    }

    await this.editMessage({ text })
    this.lastSentText = text
    this.transport.markSent()
  }

  private async sendMessage(args: { text: string }): Promise<{ message_id: number }> {
    const baseOptions = {
      ...(this.envelope.threadId ? { message_thread_id: Number(this.envelope.threadId) } : {}),
      ...(this.envelope.messageId ? { reply_parameters: { message_id: Number(this.envelope.messageId) } } : {})
    }

    return await this.bot.api.sendMessage(
      Number(this.envelope.chatId),
      args.text,
      baseOptions
    )
  }

  private async editMessage(args: { text: string }): Promise<void> {
    if (!this.sentMessageId) {
      return
    }

    await this.bot.api.editMessageText(
      Number(this.envelope.chatId),
      this.sentMessageId,
      args.text,
      {}
    )
  }

  private captureStickyPreviewBase(): void {
    if (this.finalized) {
      return
    }

    const snapshot = this.renderState.snapshot()
    const latestAssistantState = snapshot.preview ?? snapshot.committed
    this.transport.captureStickyPreviewBase({
      committedState: snapshot.committed,
      previewState: snapshot.preview ?? undefined,
      latestAssistantState
    })
  }

  private updateLatestTransportState(): void {
    const snapshot = this.renderState.snapshot()
    const latestAssistantState = snapshot.preview ?? snapshot.committed
    this.latestText = this.transport.update({
      committedState: snapshot.committed,
      previewState: snapshot.preview ?? undefined,
      latestAssistantState
    }).text
  }
}
