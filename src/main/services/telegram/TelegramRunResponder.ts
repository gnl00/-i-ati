import type { Bot } from 'grammy'
import { extractContentFromSegments } from '@main/services/agentCore/execution/parser/segment-content'
import type { TelegramInboundEnvelope } from '@main/services/hostAdapters/telegram'
import type { ChatRunEventEnvelope, ChatRunEventPayloads } from '@shared/chatRun/events'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'

const STREAM_UPDATE_THROTTLE_MS = 400
const TELEGRAM_TOOL_FOOTER_HIDDEN_TOOLS = new Set(['emotion_report'])
const TELEGRAM_STICKY_APPEND_HIDDEN_TOOLS = new Set(['emotion_report'])

type TelegramRunResponderArgs = {
  bot: Bot
  envelope: TelegramInboundEnvelope
  logger?: {
    info?: (event: string, payload?: Record<string, unknown>) => void
    warn?: (event: string, payload?: Record<string, unknown>) => void
    error?: (event: string, payload?: Record<string, unknown>) => void
  }
}

type TelegramRenderBlock = {
  kind: 'text' | 'tool'
  key: string
  text: string
}

export class TelegramRunResponder {
  private readonly bot: Bot
  private readonly envelope: TelegramInboundEnvelope
  private readonly logger?: TelegramRunResponderArgs['logger']
  private latestText = ''
  private latestBaseText = ''
  private latestFooterLines: string[] = []
  private readonly committedBlocks: TelegramRenderBlock[] = []
  private activePreviewText = ''
  private latestAssistantMessage?: MessageEntity
  private stickyPreviewText = ''
  private stickyPreviewFooterLines: string[] = []
  private stickyPreviewForceAppend = false
  private sentMessageId?: number
  private lastSentText = ''
  private lastSentBaseText = ''
  private lastSentFooterLines: string[] = []
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
        const committedBlocks = this.extractCommittedBlocks(message)
        if (committedBlocks.length > 0) {
          this.replaceCommittedBlocks(committedBlocks)
          this.activePreviewText = ''
          const nextText = this.renderTransportText()
          if (!nextText || nextText === this.latestText) {
            return
          }

          this.latestText = nextText
          this.scheduleFlush()
          return
        }

        const nextText = this.extractTransportText(message)
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
        const nextText = this.extractTransportText(message)
        if (!nextText || nextText === this.latestText) {
          return
        }

        this.latestText = nextText
        this.scheduleFlush()
        return
      }

      case CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED:
        this.activePreviewText = ''
        this.captureStickyPreviewBase()
        return

      case CHAT_RUN_EVENTS.RUN_COMPLETED:
        this.finalized = true
        this.clearScheduledFlush()
        const hadActivePreview = this.activePreviewText.trim().length > 0
        this.promoteActivePreviewToCommitted()
        if (!hadActivePreview) {
          this.syncCommittedBlocksFromLatestAssistantMessage()
        }
        this.latestText = this.renderTransportText()
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
      const sent = await this.sendMessage({ text })
      this.sentMessageId = sent.message_id
      this.lastSentText = text
      this.captureLastSentTransportState()
      this.finalRenderCommitted = args.final
      if (args.final) {
        this.consumeStickyPreviewIfRendered(text)
      }
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
      await this.editMessage({ text })
      this.lastSentText = text
      this.captureLastSentTransportState()
      this.finalRenderCommitted = true
      this.consumeStickyPreviewIfRendered(text)
      return
    }

    await this.editMessage({ text })
    this.lastSentText = text
    this.captureLastSentTransportState()
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

  private extractText(message?: MessageEntity): string {
    const fromSegments = message?.body.segments?.length
      ? extractContentFromSegments(message.body.segments)
      : ''
    const fromContent = typeof message?.body.content === 'string'
      ? message.body.content
      : ''

    return (fromSegments || fromContent || '').trim()
  }

  private extractTransportText(message: MessageEntity): string {
    const rawContentText = this.extractText(message)
    const previewText = this.committedBlocks.length > 0
      ? rawContentText.trim()
      : this.composeTransportText(rawContentText).text

    this.activePreviewText = previewText
    const rawText = this.renderTransportText()
    this.latestBaseText = rawText
    const toolFooterLines = this.extractToolFooterLines(message)
    this.latestFooterLines = toolFooterLines
    const footerLines = toolFooterLines.length > 0
      ? toolFooterLines
      : this.committedBlocks.length === 0 && this.activePreviewText
        ? this.stickyPreviewFooterLines
        : []

    if (footerLines.length === 0) {
      return rawText
    }

    return rawText
      ? `${rawText}\n\n${footerLines.map(line => `> ${line}`).join('\n')}`
      : footerLines.map(line => `> ${line}`).join('\n')
  }

  private extractToolFooterLines(message?: MessageEntity): string[] {
    const segments = message?.body.segments
    if (!segments?.length) {
      return []
    }

    return segments
      .filter((segment): segment is ToolCallSegment => (
        segment.type === 'toolCall' &&
        !this.shouldHideToolFooter(segment)
      ))
      .map((segment) => this.formatToolFooterLine(segment))
      .filter(Boolean)
  }

  private shouldHideToolFooter(segment: ToolCallSegment): boolean {
    const toolName = typeof segment.content?.toolName === 'string' ? segment.content.toolName : segment.name
    return TELEGRAM_TOOL_FOOTER_HIDDEN_TOOLS.has(toolName)
  }

  private formatToolFooterLine(segment: ToolCallSegment): string {
    const toolName = typeof segment.content?.toolName === 'string'
      ? segment.content.toolName
      : segment.name || 'tool'
    const label = toolName.replace(/_/g, ' ')
    const status = typeof segment.content?.status === 'string' ? segment.content.status : undefined
    const isError = Boolean(segment.isError)

    if (isError || status === 'failed' || status === 'aborted') {
      return `tool ${label} failed`
    }
    if (status === 'running' || status === 'executing' || status === 'pending') {
      return `tool ${label} running`
    }
    return `tool ${label} done`
  }

  private captureStickyPreviewBase(): void {
    if (this.finalized) {
      return
    }

    if (this.committedBlocks.length > 0) {
      this.stickyPreviewText = ''
      this.stickyPreviewFooterLines = []
      this.stickyPreviewForceAppend = false
      return
    }

    const candidate = this.lastSentBaseText.trim()
    if (!candidate) {
      return
    }

    this.stickyPreviewText = candidate
    this.stickyPreviewFooterLines = [...this.lastSentFooterLines]
    this.stickyPreviewForceAppend = this.hasOnlyStickyAppendHiddenTools(this.latestAssistantMessage)
  }

  private composeTransportText(nextText: string): { text: string, usedStickyPreview: boolean } {
    const normalized = nextText.trim()
    if (!normalized) {
      return { text: '', usedStickyPreview: false }
    }

    if (!this.shouldUseStickyPreview(normalized)) {
      this.stickyPreviewText = ''
      this.stickyPreviewFooterLines = []
      this.stickyPreviewForceAppend = false
      return { text: normalized, usedStickyPreview: false }
    }

    return {
      text: `${this.stickyPreviewText}${normalized}`,
      usedStickyPreview: true
    }
  }

  private shouldUseStickyPreview(nextText: string): boolean {
    if (!this.stickyPreviewText) {
      return false
    }

    if (nextText.startsWith(this.stickyPreviewText)) {
      return false
    }

    if (this.stickyPreviewForceAppend) {
      return true
    }

    return this.isAppendableTailText(nextText)
  }

  private consumeStickyPreviewIfRendered(text: string): void {
    if (!this.stickyPreviewText) {
      return
    }

    if (text.startsWith(this.stickyPreviewText) || text === this.stickyPreviewText) {
      this.stickyPreviewText = ''
      this.stickyPreviewFooterLines = []
      this.stickyPreviewForceAppend = false
    }
  }

  private captureLastSentTransportState(): void {
    this.lastSentFooterLines = [...this.latestFooterLines]

    const candidate = this.latestBaseText.trim()
    if (!candidate) {
      return
    }

    this.lastSentBaseText = candidate
  }

  private isAppendableTailText(text: string): boolean {
    return text.length <= 8 && !/[\p{L}\p{N}]/u.test(text)
  }

  private extractCommittedBlocks(message?: MessageEntity): TelegramRenderBlock[] {
    const segments = message?.body.segments
    if (segments?.length) {
      const blocks: TelegramRenderBlock[] = []
      let textBlockIndex = 0

      segments.forEach((segment, index) => {
        if (segment.type === 'text') {
          const text = segment.content.trim()
          if (!text) return
          blocks.push({
            kind: 'text',
            key: segment.segmentId || `text:${textBlockIndex++}:${index}`,
            text
          })
          return
        }

        if (segment.type === 'toolCall' && !this.shouldHideToolFooter(segment)) {
          const text = this.formatToolFooterLine(segment)
          if (!text) return
          blocks.push({
            kind: 'tool',
            key: `tool:${segment.toolCallId || segment.name || index}`,
            text
          })
        }
      })

      if (blocks.length > 0) {
        return blocks
      }
    }

    const fallbackText = this.extractText(message)
    if (!fallbackText) {
      return []
    }

    return [{
      kind: 'text',
      key: 'text:fallback',
      text: fallbackText
    }]
  }

  private promoteActivePreviewToCommitted(): void {
    const text = this.activePreviewText.trim()
    if (!text) {
      return
    }

    this.appendCommittedText(text)
    this.activePreviewText = ''
  }

  private appendCommittedText(text: string): void {
    const normalized = text.trim()
    if (!normalized) {
      return
    }

    const lastBlock = this.committedBlocks[this.committedBlocks.length - 1]
    if (lastBlock?.kind === 'text' && lastBlock.text === normalized) {
      return
    }

    this.committedBlocks.push({
      kind: 'text',
      key: `text:${this.committedBlocks.length}`,
      text: normalized
    })
  }

  private replaceCommittedBlocks(blocks: TelegramRenderBlock[]): void {
    this.committedBlocks.splice(0, this.committedBlocks.length, ...blocks.map(block => ({ ...block })))
  }

  private syncCommittedBlocksFromLatestAssistantMessage(): void {
    const blocks = this.extractCommittedBlocks(this.latestAssistantMessage)
    if (blocks.length === 0) {
      return
    }
    this.replaceCommittedBlocks(blocks)
  }

  private renderTransportText(): string {
    const blocks = [...this.committedBlocks]
    if (this.activePreviewText.trim()) {
      blocks.push({
        kind: 'text',
        key: 'preview',
        text: this.activePreviewText.trim()
      })
    }

    let output = ''
    let previousKind: TelegramRenderBlock['kind'] | undefined

    for (const block of blocks) {
      if (block.kind === 'tool') {
        output = output
          ? `${output}\n\n> ${block.text}`
          : `> ${block.text}`
        previousKind = 'tool'
        continue
      }

      output = output
        ? previousKind === 'tool'
          ? `${output}\n${block.text}`
          : `${output}${block.text}`
        : block.text
      previousKind = 'text'
    }

    return output.trim()
  }

  private hasOnlyStickyAppendHiddenTools(message?: MessageEntity): boolean {
    const segments = message?.body.segments
    if (!segments?.length) {
      return false
    }

    const toolCalls = segments.filter((segment): segment is ToolCallSegment => segment.type === 'toolCall')
    if (toolCalls.length === 0) {
      return false
    }

    return toolCalls.every((segment) => {
      const toolName = typeof segment.content?.toolName === 'string' ? segment.content.toolName : segment.name
      return TELEGRAM_STICKY_APPEND_HIDDEN_TOOLS.has(toolName)
    })
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
