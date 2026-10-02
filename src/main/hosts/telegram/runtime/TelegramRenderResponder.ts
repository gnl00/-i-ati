import { InputFile, type Bot } from 'grammy'
import { parseImageShowResult, type ImageShowResult } from '@shared/tools/image/types'
import { randomInt } from 'node:crypto'
import { AbortController as TelegramAbortController } from 'abort-controller'
import { imageAssetService } from '@main/services/images/ImageAssetService'
import { deliverTelegramText, isTelegramFormattingError, withTelegramRetry, type TelegramTextMessage } from '@main/services/telegram/TelegramTextDelivery'
import { formatTelegramRichText, splitTelegramText } from '@main/services/telegram/telegram-rich-text'
import { TelegramToolMessages } from './TelegramToolMessages'
import type { TelegramInboundEnvelope } from '@main/hosts/telegram'
import {
  AgentRenderSegmentMapper,
  HostStepOutputPolicy,
  type AgentRenderToolCallState,
  type HostRenderEvent,
  type HostRenderEventSink
} from '@main/hosts/shared/render'
import { RUN_STATES } from '@shared/run/lifecycle-events'

const STREAM_UPDATE_THROTTLE_MS = 400
const MAX_TOOL_ARGS_DISPLAY_LENGTH = 200

type SentTelegramMessage = {
  messages: TelegramTextMessage[]
  lastText: string
  draftId?: number
  draftText?: string
  deliveryFailed?: boolean
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
  toolMessages?: TelegramToolMessages
  submissionId?: string
  envelope: TelegramInboundEnvelope
  logger?: {
    info?: (event: string, payload?: Record<string, unknown>) => void
    warn?: (event: string, payload?: Record<string, unknown>) => void
    error?: (event: string, payload?: Record<string, unknown>) => void
  }
}

export class TelegramRenderResponder implements HostRenderEventSink {
  private readonly toolMessages: TelegramToolMessages
  private readonly submissionId: string
  private readonly bot: Bot
  private readonly envelope: TelegramInboundEnvelope
  private readonly logger?: TelegramRenderResponderArgs['logger']
  private readonly policy = new HostStepOutputPolicy()
  private readonly segments = new AgentRenderSegmentMapper({ policy: this.policy })
  private readonly textMessages = new Map<string, SentTelegramMessage>()
  private readonly toolStates = new Map<string, TelegramToolState>()
  private readonly imageCalls = new Set<string>()
  private updateToolResult?: (toolCallId: string, content: unknown) => boolean
  private readonly pendingTextEdits = new Map<string, { text: string }>()
  private finalized = false
  private stopped = false
  private draftsEnabled = true
  private draftHeartbeat?: NodeJS.Timeout
  private readonly draftAbort = new AbortController()
  private readonly draftApiAbort = new TelegramAbortController()
  private flushTimer?: NodeJS.Timeout
  private queue: Promise<void> = Promise.resolve()

  constructor(args: TelegramRenderResponderArgs) {
    this.toolMessages = args.toolMessages ?? new TelegramToolMessages()
    this.submissionId = args.submissionId ?? args.envelope.updateId.toString()
    this.bot = args.bot
    this.envelope = args.envelope
    this.logger = args.logger
    this.draftAbort.signal.addEventListener('abort', (): void => this.draftApiAbort.abort(), { once: true })
  }

  connectToolResultUpdates(update: (toolCallId: string, content: unknown) => boolean): void {
    this.updateToolResult = update
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
    if (this.finalized && event.type !== 'host.lifecycle.updated') return
    switch (event.type) {
      case 'host.preview.updated':
        await this.renderPreview(event)
        return

      case 'host.committed.updated':
        await this.renderCommitted(event)
        return

      case 'host.preview.cleared':
        return

      case 'host.lifecycle.updated':
        if (event.state === RUN_STATES.STREAMING && this.envelope.chatType === 'private' && this.draftsEnabled && this.textMessages.size === 0) {
          const entry: SentTelegramMessage = { messages: [], lastText: '' }
          this.textMessages.set('__thinking', entry)
          await this.sendDraft(entry, '')
        }
        if (event.state === RUN_STATES.COMPLETED) {
          this.finalized = true
          this.clearScheduledFlush()
          this.clearDraftHeartbeat()
          await this.flushPendingTextEdits()
          await this.persistDrafts()
          return
        }

        if (event.state === RUN_STATES.FAILED || event.state === RUN_STATES.ABORTED) {
          this.finalized = true
          this.clearScheduledFlush()
          this.clearDraftHeartbeat()
          await this.flushPendingTextEdits()
          await this.persistDrafts()
          return
        }

        return

      case 'host.tool.detected':
        this.updateToolState({ toolCallId: event.toolCallId, toolName: event.toolName, args: event.toolArgs })
        return

      case 'host.tool.execution.started':
        await this.sendToolStart({
          toolCallId: event.toolCallId,
          toolName: event.toolName
        })
        return

      case 'host.tool.confirmation.required':
        // Approval presentation is owned by the versioned run interaction stream.
        return

      case 'host.tool.result.available':
        if (event.result.toolName === 'image_show' && event.result.status === 'success') {
          const image = parseImageShowResult(event.result.content)
          if (image) await this.sendImage(event.result.toolCallId, image)
        }
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

  private async sendImage(toolCallId: string, result: ImageShowResult): Promise<void> {
    if (this.imageCalls.has(toolCallId)) return
    this.imageCalls.add(toolCallId)
    // Persist the attempt before upload. History hydration never calls this method.
    const delivery = { state: 'sending' as const, chatId: this.envelope.chatId,
      ...(this.bot.botInfo?.id ? { botId: String(this.bot.botInfo.id) } : {}),
      ...(this.envelope.threadId ? { threadId: this.envelope.threadId } : {}) }
    if (!this.updateToolResult) throw new Error('Image delivery persistence is not connected.')
    if (!this.updateToolResult(toolCallId, { ...result, telegram: delivery })) return
    let method: 'photo' | 'document' = result.image.mimeType !== 'image/gif'
      && result.image.size <= 10 * 1024 * 1024
      && result.image.width + result.image.height <= 10000
      && Math.max(result.image.width, result.image.height) / Math.min(result.image.width, result.image.height) <= 20
      ? 'photo' : 'document'
    const options = {
      ...(result.caption ? { caption: result.caption } : {}),
      ...(this.envelope.threadId ? { message_thread_id: Number(this.envelope.threadId) } : {}),
      ...(this.envelope.messageId ? { reply_parameters: { message_id: Number(this.envelope.messageId) } } : {})
    }
    let data: Buffer
    try {
      data = await imageAssetService.read(result.image.assetId)
    } catch {
      this.updateToolResult(toolCallId, { ...result, telegram: { ...delivery, state: 'failed' } })
      await deliverTelegramText(this.bot, { chatId: this.envelope.chatId, threadId: this.envelope.threadId }, 'Image delivery failed: the saved image is unavailable.')
      return
    }
    let sent: { message_id: number }
    try {
      const upload = (): InputFile => new InputFile(data, `image.${result.image.assetId.split('.').at(-1)}`)
      if (method === 'photo') {
        try { sent = await withTelegramRetry(() => this.bot.api.sendPhoto(Number(this.envelope.chatId), upload(), options)) } catch (error) {
          const response = error as { error_code?: number; description?: string }
          // Only a definite image-format rejection permits a different send method.
          if (response.error_code !== 400 || !/PHOTO_INVALID_DIMENSIONS|IMAGE_PROCESS_FAILED|PHOTO_EXT_INVALID|PHOTO_CONTENT_TYPE_INVALID|PHOTO_INVALID/i.test(response.description || '')) throw error
          method = 'document'
          sent = await withTelegramRetry(() => this.bot.api.sendDocument(Number(this.envelope.chatId), upload(), options))
        }
      } else { sent = await withTelegramRetry(() => this.bot.api.sendDocument(Number(this.envelope.chatId), upload(), options)) }
    } catch (error) {
      const code = (error as { error_code?: number }).error_code
      const state = code && code >= 400 && code < 500 ? 'failed' : 'unknown'
      this.updateToolResult(toolCallId, { ...result, telegram: { ...delivery, state, method } })
      await deliverTelegramText(this.bot, { chatId: this.envelope.chatId, threadId: this.envelope.threadId },
        state === 'failed' ? 'Image delivery failed.' : 'Image delivery could not be confirmed. The upload will not be repeated automatically.')
      return
    }
    // Keep persistence outside the upload catch: a receipt failure must never re-upload.
    this.updateToolResult(toolCallId, { ...result, telegram: { ...delivery, state: 'sent', method, messageId: sent.message_id } })
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

  /** Stop only a live draft belonging to this run. Called before queuing cancellation. */
  stopDraft(draftId: number): boolean {
    if (this.finalized || this.stopped || ![...this.textMessages.values()].some(entry => entry.draftId === draftId && entry.draftText !== undefined)) return false
    this.stopped = true
    this.draftAbort.abort()
    this.clearScheduledFlush()
    this.clearDraftHeartbeat()
    return true
  }

  dispose(): void {
    this.finalized = true
    this.stopped = true
    this.draftAbort.abort()
    this.clearScheduledFlush()
    this.clearDraftHeartbeat()
    this.pendingTextEdits.clear()
    for (const entry of this.textMessages.values()) entry.draftText = undefined
  }

  async finish(): Promise<void> {
    await this.handle({ type: 'host.lifecycle.updated', state: RUN_STATES.COMPLETED, timestamp: Date.now() })
  }

  private clearDraftHeartbeat(): void {
    if (this.draftHeartbeat) clearTimeout(this.draftHeartbeat)
    this.draftHeartbeat = undefined
  }

  private scheduleDraftHeartbeat(): void {
    if (this.draftHeartbeat || this.finalized || this.stopped) return
    this.draftHeartbeat = setTimeout(() => {
      this.draftHeartbeat = undefined
      this.queue = this.queue.then(async () => {
        for (const entry of this.textMessages.values()) {
          if (entry.draftId && entry.draftText !== undefined) await this.sendDraft(entry, entry.draftText)
        }
      }).catch(error => this.logger?.warn?.('telegram.draft_refresh_failed', { error: String(error) }))
    }, 15000)
    this.draftHeartbeat.unref()
  }

  private async sendDraft(entry: SentTelegramMessage, text: string): Promise<void> {
    if (this.stopped || this.finalized) return
    entry.draftId ??= randomInt(1, 2 ** 31)
    // Drafts are bounded previews; final delivery retains all chunks.
    const preview = splitTelegramText(text, 30000)[0] ?? ''
    entry.draftText = text
    try {
      await withTelegramRetry(() => this.bot.api.sendRichMessageDraft(Number(this.envelope.chatId), entry.draftId!, {
        html: preview ? formatTelegramRichText(preview, true).text : '<tg-thinking>Thinking...</tg-thinking>'
      }, {
        ...(this.envelope.threadId ? { message_thread_id: Number(this.envelope.threadId) } : {}),
        can_stop: true, keep_on_stop: true
      }, this.draftApiAbort.signal), this.draftAbort.signal)
      entry.draftText = text
      entry.lastText = text
      this.scheduleDraftHeartbeat()
    } catch (error) {
      if (this.stopped) return
      // Only explicit unsupported/formatting rejections trigger the persistent fallback.
      const description = error && typeof error === 'object' && 'description' in error ? String(error.description) : ''
      const code = error && typeof error === 'object' && 'error_code' in error ? error.error_code : undefined
      if (!isTelegramFormattingError(error) && !([400, 404].includes(Number(code)) && /method.*(?:not found|not supported|unknown)|unknown method/i.test(description))) throw error
      this.draftsEnabled = false
      entry.draftText = undefined
      if (text.trim()) await this.deliverText(entry, text)
    }
  }

  private async deliverText(entry: SentTelegramMessage, text: string): Promise<void> {
    if (entry.deliveryFailed) return
    try {
      await deliverTelegramText(this.bot, {
        chatId: this.envelope.chatId, threadId: this.envelope.threadId, replyToMessageId: this.envelope.messageId
      }, text, entry.messages)
      entry.lastText = text
      entry.draftText = undefined
    } catch (error) {
      // An unconfirmed send may have arrived. Later lifecycle/commit events must not resend it.
      entry.deliveryFailed = true
      entry.draftText = undefined
      throw error
    }
  }

  private async persistDrafts(): Promise<void> {
    this.clearDraftHeartbeat()
    for (const entry of this.textMessages.values()) {
      if (entry.draftText !== undefined) {
        if (entry.draftText.trim()) await this.deliverText(entry, entry.draftText)
        else if (this.stopped) await this.deliverText(entry, 'Generation stopped.')
        entry.draftText = undefined
      }
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

    let existing = this.textMessages.get(key)
    if (!existing && this.textMessages.has('__thinking')) {
      existing = this.textMessages.get('__thinking')!
      this.textMessages.delete('__thinking')
      this.textMessages.set(key, existing)
    }
    if (!existing) {
      existing = { messages: [], lastText: '' }
      this.textMessages.set(key, existing)
    }
    if (existing.deliveryFailed) return
    const draft = options.stream && this.envelope.chatType === 'private' && this.draftsEnabled
    if (options.stream && this.stopped) return
    if (existing.lastText === text && (options.stream || existing.draftText === undefined)) return
    if (options.stream && existing.lastText) {
      this.pendingTextEdits.set(key, { text })
      this.scheduleFlush()
      return
    }
    this.pendingTextEdits.delete(key)
    if (draft) {
      // A private chat displays one native draft at a time. Persist previous text blocks first.
      for (const entry of this.textMessages.values()) {
        if (entry !== existing && entry.draftText !== undefined && entry.draftText.trim()) await this.deliverText(entry, entry.draftText)
      }
      await this.sendDraft(existing, text)
    }
    else await this.deliverText(existing, text)
  }

  private async flushPendingTextEdits(): Promise<void> {
    const pending = [...this.pendingTextEdits.entries()]
    this.pendingTextEdits.clear()
    for (const [key, pendingEdit] of pending) {
      const existing = this.textMessages.get(key)
      if (!existing || existing.lastText === pendingEdit.text) continue
      if (this.envelope.chatType === 'private' && this.draftsEnabled && !this.finalized) {
        await this.sendDraft(existing, pendingEdit.text)
      } else await this.deliverText(existing, pendingEdit.text)
    }
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
    if (status === 'pending') {
      this.updateToolState({ toolCallId: segment.toolCallId, toolName: content.toolName || segment.name, args: content.args })
      return
    }
    if (status === 'running') {
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
    if (this.policy.isToolHidden(args.toolName)) {
      return
    }

    const state = this.updateToolState(args)
    if (state.startSent) {
      return
    }

    await this.toolMessages.update({
      bot: this.bot, envelope: this.envelope, submissionId: this.submissionId,
      toolCallId: args.toolCallId, rank: 3,
      text: this.formatToolDoneMessage({ toolName: state.toolName, args: state.args, status: 'running' })
    })
    this.toolStates.set(args.toolCallId, {
      ...state,
      startSent: true
    })
    this.logger?.info?.('telegram.render_responder.tool_start_sent', {
      updateId: this.envelope.updateId,
      chatId: this.envelope.chatId,
      toolCallId: args.toolCallId
    })
  }

  private async sendToolDone(args: {
    toolCallId: string
    toolName: string
    args?: string
    status: AgentRenderToolCallState['status']
  }): Promise<void> {
    if (this.policy.isToolHidden(args.toolName)) {
      return
    }

    const state = this.updateToolState(args)
    if (state.doneSent) {
      return
    }

    const current = this.toolStates.get(args.toolCallId) || state
    await this.toolMessages.update({
      bot: this.bot, envelope: this.envelope, submissionId: this.submissionId,
      toolCallId: args.toolCallId, rank: 4,
      text: this.formatToolDoneMessage({
        toolName: current.toolName, status: args.status, args: current.args
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

  private formatToolDoneMessage(args: {
    toolName: string
    status: AgentRenderToolCallState['status']
    args?: string
  }): string {
    const label = this.formatToolLabel(args.toolName)
    const status = this.formatToolStatus(args.status)
    const title = this.escapeHtml(`tool ${label} ${status}`)
    const argsValue = this.formatToolArgsValue(args.args)
    return argsValue
      ? `<blockquote>${title}</blockquote>\n<blockquote expandable>${this.escapeHtml(argsValue)}</blockquote>`
      : `<blockquote>${title}</blockquote>`
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

  private formatToolArgsValue(args: string | undefined): string {
    const normalized = args?.replace(/\s+/g, ' ').trim()
    if (!normalized) {
      return ''
    }

    const value = normalized.length <= MAX_TOOL_ARGS_DISPLAY_LENGTH
      ? normalized
      : `${normalized.slice(0, MAX_TOOL_ARGS_DISPLAY_LENGTH - 3)}...`
    return value
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  private toStableSegmentKey(segment: Pick<MessageSegment, 'segmentId'>): string {
    return segment.segmentId.replace(/^(preview|committed):/, '')
  }

}
