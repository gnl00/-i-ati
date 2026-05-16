import type { Bot } from 'grammy'
import type { TelegramInboundEnvelope } from '@main/hosts/telegram'
import {
  AgentRenderSegmentMapper,
  HostRenderStateController,
  type AgentRenderToolCallState,
  type HostRenderEvent,
  type HostRenderEventSink
} from '@main/hosts/shared/render'
import { RUN_STATES } from '@shared/run/lifecycle-events'

const STREAM_UPDATE_THROTTLE_MS = 400
const MAX_TOOL_ARGS_DISPLAY_LENGTH = 200
const TELEGRAM_HIDDEN_TOOL_MESSAGES = new Set(['emotion_report'])

type SentTelegramMessage = {
  messageId: number
  lastText: string
}

type TelegramToolState = {
  toolName: string
  args?: string
  startSent: boolean
  doneSent: boolean
  terminalStatus?: AgentRenderToolCallState['status']
}

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
  private readonly segments = new AgentRenderSegmentMapper()
  private readonly textMessages = new Map<string, SentTelegramMessage>()
  private readonly toolStates = new Map<string, TelegramToolState>()
  private readonly pendingTextEdits = new Map<string, { text: string }>()
  private finalized = false
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
      case 'host.preview.updated':
        this.renderState.apply(event)
        await this.renderPreview(event)
        return

      case 'host.committed.updated':
        this.renderState.apply(event)
        await this.renderCommitted(event)
        return

      case 'host.preview.cleared':
        this.renderState.apply(event)
        return

      case 'host.lifecycle.updated':
        if (event.state === RUN_STATES.COMPLETED) {
          this.finalized = true
          this.clearScheduledFlush()
          await this.flushPendingTextEdits()
          return
        }

        if (event.state === RUN_STATES.FAILED || event.state === RUN_STATES.ABORTED) {
          this.finalized = true
          this.clearScheduledFlush()
          await this.flushPendingTextEdits()
          return
        }

        return

      case 'host.tool.detected':
        await this.sendToolStart({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.toolArgs
        })
        return

      case 'host.tool.execution.started':
        await this.sendToolStart({
          toolCallId: event.toolCallId,
          toolName: event.toolName
        })
        return

      case 'host.tool.result.available':
        await this.sendToolDone({
          toolCallId: event.result.toolCallId,
          toolName: event.result.toolName,
          status: event.result.status === 'success'
            ? 'success'
            : event.result.status === 'aborted' || event.result.status === 'denied'
              ? 'aborted'
              : 'failed'
        })
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
          await this.flushPendingTextEdits()
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

  private async editMessage(args: { messageId: number; text: string }): Promise<void> {
    try {
      await this.bot.api.editMessageText(
        Number(this.envelope.chatId),
        args.messageId,
        args.text,
        {}
      )
    } catch (error) {
      if (this.isMessageNotModifiedError(error)) {
        return
      }
      throw error
    }
  }

  private async renderPreview(event: Extract<HostRenderEvent, { type: 'host.preview.updated' }>): Promise<void> {
    const segments = this.segments.buildSegments({
      state: event.preview,
      timestamp: event.timestamp,
      includeText: true,
      layer: 'preview'
    })

    for (const segment of segments) {
      await this.renderSegment(segment, { stream: true })
    }
  }

  private async renderCommitted(event: Extract<HostRenderEvent, { type: 'host.committed.updated' }>): Promise<void> {
    const segments = this.segments.buildSegments({
      state: event.committed,
      timestamp: event.timestamp,
      includeText: Boolean(event.committed.content.trim()),
      layer: 'committed'
    })

    for (const segment of segments) {
      await this.renderSegment(segment, { stream: false })
    }
  }

  private async renderSegment(segment: MessageSegment, options: { stream: boolean }): Promise<void> {
    if (segment.presentation?.transcriptVisible === false) {
      return
    }

    if (segment.type === 'text') {
      await this.renderTextSegment(segment, options)
      return
    }

    if (segment.type === 'toolCall') {
      await this.renderToolSegment(segment)
      return
    }

    if (segment.type === 'error') {
      await this.renderTextSegment({
        type: 'text',
        segmentId: segment.segmentId,
        content: `Error: ${segment.error.message}`,
        timestamp: segment.error.timestamp
      }, { stream: false })
    }
  }

  private async renderTextSegment(segment: TextSegment, options: { stream: boolean }): Promise<void> {
    const key = this.toStableSegmentKey(segment)
    const text = segment.content.trim()
    if (!text) {
      return
    }

    const existing = this.textMessages.get(key)
    if (!existing) {
      const sent = await this.sendMessage({ text })
      this.textMessages.set(key, {
        messageId: sent.message_id,
        lastText: text
      })
      this.logger?.info?.('telegram.render_responder.text_message_sent', {
        updateId: this.envelope.updateId,
        chatId: this.envelope.chatId,
        messageId: sent.message_id,
        stream: options.stream
      })
      return
    }

    if (existing.lastText === text) {
      return
    }

    if (options.stream) {
      this.pendingTextEdits.set(key, { text })
      this.scheduleFlush()
      return
    }

    this.pendingTextEdits.delete(key)
    await this.editTextMessage(key, existing, text)
  }

  private async flushPendingTextEdits(): Promise<void> {
    const pending = [...this.pendingTextEdits.entries()]
    this.pendingTextEdits.clear()

    for (const [key, pendingEdit] of pending) {
      const existing = this.textMessages.get(key)
      if (!existing || existing.lastText === pendingEdit.text) {
        continue
      }
      await this.editTextMessage(key, existing, pendingEdit.text)
    }
  }

  private async editTextMessage(
    key: string,
    existing: SentTelegramMessage,
    text: string
  ): Promise<void> {
    await this.editMessage({
      messageId: existing.messageId,
      text
    })
    this.textMessages.set(key, {
      messageId: existing.messageId,
      lastText: text
    })
  }

  private async renderToolSegment(segment: ToolCallSegment): Promise<void> {
    if (!segment.toolCallId) {
      return
    }

    const content = segment.content as {
      toolName?: string
      args?: string
      status?: AgentRenderToolCallState['status']
    }

    const status = content.status || 'pending'
    if (status === 'pending' || status === 'running') {
      await this.sendToolStart({
        toolCallId: segment.toolCallId,
        toolName: content.toolName || segment.name,
        args: content.args
      })
      return
    }

    await this.sendToolDone({
      toolCallId: segment.toolCallId,
      toolName: content.toolName || segment.name,
      args: content.args,
      status
    })
  }

  private async sendToolStart(args: {
    toolCallId: string
    toolName: string
    args?: string
  }): Promise<void> {
    if (TELEGRAM_HIDDEN_TOOL_MESSAGES.has(args.toolName)) {
      return
    }

    const state = this.updateToolState(args)
    if (state.startSent) {
      return
    }

    const sent = await this.sendMessage({
      text: this.formatToolStartMessage(args.toolName)
    })
    this.toolStates.set(args.toolCallId, {
      ...state,
      startSent: true
    })
    this.logger?.info?.('telegram.render_responder.tool_start_sent', {
      updateId: this.envelope.updateId,
      chatId: this.envelope.chatId,
      messageId: sent.message_id,
      toolCallId: args.toolCallId
    })
  }

  private async sendToolDone(args: {
    toolCallId: string
    toolName: string
    args?: string
    status: AgentRenderToolCallState['status']
  }): Promise<void> {
    if (TELEGRAM_HIDDEN_TOOL_MESSAGES.has(args.toolName)) {
      return
    }

    const state = this.updateToolState(args)
    if (state.doneSent) {
      return
    }

    if (!state.startSent) {
      const startSent = await this.sendMessage({
        text: this.formatToolStartMessage(state.toolName)
      })
      this.toolStates.set(args.toolCallId, {
        ...state,
        startSent: true
      })
      this.logger?.info?.('telegram.render_responder.tool_start_sent', {
        updateId: this.envelope.updateId,
        chatId: this.envelope.chatId,
        messageId: startSent.message_id,
        toolCallId: args.toolCallId
      })
    }

    const current = this.toolStates.get(args.toolCallId) || state
    const doneSent = await this.sendMessage({
      text: this.formatToolDoneMessage({
        toolName: current.toolName,
        status: args.status,
        args: current.args
      })
    })
    this.toolStates.set(args.toolCallId, {
      ...current,
      terminalStatus: args.status,
      doneSent: true
    })
    this.logger?.info?.('telegram.render_responder.tool_done_sent', {
      updateId: this.envelope.updateId,
      chatId: this.envelope.chatId,
      messageId: doneSent.message_id,
      toolCallId: args.toolCallId
    })
  }

  private updateToolState(args: {
    toolCallId: string
    toolName: string
    args?: string
    status?: AgentRenderToolCallState['status']
  }): TelegramToolState {
    const existing = this.toolStates.get(args.toolCallId)
    const next: TelegramToolState = {
      toolName: args.toolName || existing?.toolName || 'tool',
      ...(args.args || existing?.args ? { args: args.args ?? existing?.args } : {}),
      startSent: existing?.startSent ?? false,
      doneSent: existing?.doneSent ?? false,
      ...(args.status && args.status !== 'pending' && args.status !== 'running'
        ? { terminalStatus: args.status }
        : existing?.terminalStatus
          ? { terminalStatus: existing.terminalStatus }
          : {})
    }
    this.toolStates.set(args.toolCallId, next)
    return next
  }

  private formatToolStartMessage(toolName: string): string {
    return `> tool ${this.formatToolLabel(toolName)} start`
  }

  private formatToolDoneMessage(args: {
    toolName: string
    status: AgentRenderToolCallState['status']
    args?: string
  }): string {
    const label = this.formatToolLabel(args.toolName)
    const status = this.formatToolStatus(args.status)
    const argsBlock = this.formatToolArgsBlock(args.args)
    return argsBlock
      ? `> tool ${label} ${status}\n\n${argsBlock}`
      : `> tool ${label} ${status}`
  }

  private formatToolLabel(toolName: string): string {
    return toolName.replace(/_/g, ' ')
  }

  private formatToolStatus(status: AgentRenderToolCallState['status']): string {
    if (status === 'success') {
      return 'done'
    }
    if (status === 'failed') {
      return 'failed'
    }
    if (status === 'aborted') {
      return 'aborted'
    }
    return 'running'
  }

  private formatToolArgsBlock(args: string | undefined): string {
    const normalized = args?.replace(/\s+/g, ' ').trim()
    if (!normalized) {
      return ''
    }

    const value = normalized.length <= MAX_TOOL_ARGS_DISPLAY_LENGTH
      ? normalized
      : `${normalized.slice(0, MAX_TOOL_ARGS_DISPLAY_LENGTH - 3)}...`
    return `\`\`\`args\n${value}\n\`\`\``
  }

  private toStableSegmentKey(segment: Pick<MessageSegment, 'segmentId'>): string {
    return segment.segmentId.replace(/^(preview|committed):/, '')
  }

  private isMessageNotModifiedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.toLowerCase().includes('message is not modified')
  }
}
