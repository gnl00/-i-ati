import { v4 as uuidv4 } from 'uuid'
import { Bot } from 'grammy'
import { ChatRunService } from '@main/services/chatRun'
import { AppConfigStore } from '@main/services/hostAdapters/chat/config/AppConfigStore'
import { ChatModelContextResolver } from '@main/services/hostAdapters/chat/config/ChatModelContextResolver'
import { TelegramAgentAdapter, type TelegramInboundEnvelope } from '@main/services/hostAdapters/telegram'
import { extractContentFromSegments } from '@main/services/agentCore/execution'
import DatabaseService from '@main/services/DatabaseService'
import { createLogger } from '@main/services/logging/LogService'
import { formatTelegramRichText } from './telegram-rich-text'
import { TelegramUpdateMapper } from './TelegramUpdateMapper'
import { TelegramFileService } from './TelegramFileService'
import { TelegramCommandService } from './TelegramCommandService'
import { parseTelegramCommand, parseTelegramCommandCallback } from './telegram-command-parser'
import { resolveExistingChatModelRef } from '@shared/services/ChatModelResolver'

export class TelegramGatewayService {
  private static readonly IMPLEMENTATION_MARKER = 'telegram-gateway-dev-marker-2026-03-25-v2'
  private readonly logger = createLogger('TelegramGatewayService')
  private readonly adapter = new TelegramAgentAdapter()
  private readonly appConfigStore = new AppConfigStore()
  private readonly modelResolver = new ChatModelContextResolver()
  private readonly chatRunService = new ChatRunService()
  private readonly fileService = new TelegramFileService()
  private readonly commandService = new TelegramCommandService()
  private bot: Bot | null = null
  private running = false
  private starting = false
  private startRunId = 0
  private lastUpdateId = 0
  private botUsername?: string
  private botId?: string
  private lastError?: string
  private lastErrorAt?: number
  private lastSuccessfulPollAt?: number
  private lastMessageProcessedAt?: number
  private static readonly START_TIMEOUT_MS = 30_000
  private static readonly POLLING_START_TIMEOUT_MS = 30_000

  private toPreview(value: string, limit = 400): string {
    const normalized = value.replace(/\r\n?/g, '\n').trim()
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized
  }

  getStatus(): {
    running: boolean
    starting: boolean
    configured: boolean
    enabled: boolean
    mode?: 'polling' | 'webhook'
    hasDefaultModel: boolean
    lastUpdateId: number
    botUsername?: string
    botId?: string
    lastError?: string
    lastErrorAt?: number
    lastSuccessfulPollAt?: number
    lastMessageProcessedAt?: number
  } {
    const appConfig = this.appConfigStore.getConfig()
    const telegram = appConfig?.telegram
    const defaultModel = appConfig?.tools?.defaultModel
    const hasDefaultModel = Boolean(defaultModel && this.modelResolver.resolve(appConfig ?? {}, defaultModel))

    return {
      running: this.running,
      starting: this.starting,
      configured: Boolean(telegram?.botToken),
      enabled: Boolean(telegram?.enabled),
      mode: telegram?.mode,
      hasDefaultModel,
      lastUpdateId: this.lastUpdateId,
      botUsername: this.botUsername,
      botId: this.botId,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
      lastSuccessfulPollAt: this.lastSuccessfulPollAt,
      lastMessageProcessedAt: this.lastMessageProcessedAt
    }
  }

  async start(): Promise<void> {
    this.logger.info('implementation.marker', {
      marker: TelegramGatewayService.IMPLEMENTATION_MARKER,
      running: this.running,
      starting: this.starting,
      hasBot: Boolean(this.bot)
    })

    if (this.running || this.starting) {
      this.logger.info('start.skipped', { reason: this.running ? 'already running' : 'already starting' })
      return
    }

    const appConfig = this.appConfigStore.requireConfig()
    const config = appConfig.telegram
    const defaultModel = appConfig.tools?.defaultModel

    if (!config?.enabled || !config.botToken) {
      this.logger.info('start.skipped', { reason: 'telegram not configured' })
      return
    }

    if (!defaultModel || !this.modelResolver.resolve(appConfig, defaultModel)) {
      this.logger.warn('start.skipped', { reason: 'default model unavailable for telegram' })
      return
    }

    this.starting = true
    this.lastError = undefined
    this.lastErrorAt = undefined
    this.startRunId += 1
    const currentRunId = this.startRunId

    this.logger.info('start.queued', {
      runId: currentRunId,
      mode: 'polling'
    })

    void this.performStart({
      runId: currentRunId,
      botToken: config.botToken,
      defaultModel
    })
  }

  stop(): void {
    this.startRunId += 1
    this.starting = false
    this.running = false
    void this.bot?.stop().catch((error) => {
      this.logger.error('stop.failed', error)
    })
    this.bot = null
    this.logger.info('stopped')
  }

  async testConnection(botToken?: string): Promise<{ ok: boolean; username?: string; id?: string; error?: string }> {
    try {
      const config = this.appConfigStore.getConfig()?.telegram
      const token = botToken?.trim() || config?.botToken
      if (!token) {
        return { ok: false, error: 'Telegram bot token is required' }
      }

      const bot = new Bot(token)
      const me = await this.withTimeout(
        bot.api.getMe(),
        TelegramGatewayService.START_TIMEOUT_MS,
        'Telegram connection test'
      )
      return {
        ok: true,
        username: me.username,
        id: String(me.id)
      }
    } catch (error: any) {
      return {
        ok: false,
        error: error?.message || 'Telegram connection test failed'
      }
    }
  }

  async sendText(args: {
    chatId: string
    text: string
    threadId?: string
    replyToMessageId?: string
  }): Promise<{ ok: boolean; messageId?: string }> {
    if (!this.bot) {
      throw new Error('Telegram gateway not started')
    }
    const sent = await this.bot.api.sendMessage(Number(args.chatId), args.text, {
      ...(args.threadId ? { message_thread_id: Number(args.threadId) } : {}),
      ...(args.replyToMessageId ? { reply_parameters: { message_id: Number(args.replyToMessageId) } } : {})
    })

    return {
      ok: true,
      messageId: String(sent.message_id)
    }
  }

  private async handleCommand(
    envelope: TelegramInboundEnvelope,
    command: NonNullable<ReturnType<typeof parseTelegramCommand>>,
    defaultModelRef: ModelRef
  ): Promise<void> {
    const response = await this.commandService.execute(command, envelope, defaultModelRef)
    if (!this.bot) {
      return
    }

    await this.bot.api.sendMessage(Number(envelope.chatId), response.text, {
      ...(response.parseMode ? { parse_mode: response.parseMode } : {}),
      ...(response.inlineKeyboard ? {
        reply_markup: {
          inline_keyboard: response.inlineKeyboard.map((row) =>
            row.map((button) => ({
              text: button.text,
              callback_data: button.callbackData
            }))
          )
        }
      } : {}),
      ...(envelope.threadId ? { message_thread_id: Number(envelope.threadId) } : {}),
      ...(envelope.messageId ? { reply_parameters: { message_id: Number(envelope.messageId) } } : {})
    })

    this.logger.info('command.executed', {
      updateId: envelope.updateId,
      chatId: envelope.chatId,
      command: command.name
    })
    this.lastMessageProcessedAt = Date.now()
  }

  private async handleEnvelope(envelope: TelegramInboundEnvelope, modelRef: ModelRef): Promise<void> {
    this.logger.info('update.received', {
      updateId: envelope.updateId,
      chatId: envelope.chatId,
      chatType: envelope.chatType,
      threadId: envelope.threadId,
      username: envelope.username,
      textPreview: this.toPreview(envelope.text),
      mediaKinds: envelope.media.map((item) => item.kind)
    })

    const { chat, binding, created } = await this.adapter.resolveOrCreateSession(envelope, modelRef)
    const effectiveModelRef = this.resolveModelRefForChat(chat, modelRef)
    const attachmentContext = this.bot
      ? await this.fileService.buildAttachmentContext(this.bot, envelope)
      : { mediaCtx: [], documentTextBlocks: [] }
    const modelContext = this.modelResolver.resolve(this.appConfigStore.requireConfig(), effectiveModelRef)

    this.logger.info('model.selected', {
      updateId: envelope.updateId,
      chatId: envelope.chatId,
      chatUuid: chat.uuid,
      created,
      model: `${effectiveModelRef.accountId}/${effectiveModelRef.modelId}`,
      modelType: modelContext?.model.type,
      mediaCount: attachmentContext.mediaCtx.length
    })

    if (attachmentContext.mediaCtx.length > 0 && modelContext?.model.type === 'llm') {
      this.logger.warn('media.unused_by_current_model', {
        updateId: envelope.updateId,
        chatId: envelope.chatId,
        chatUuid: chat.uuid,
        model: `${effectiveModelRef.accountId}/${effectiveModelRef.modelId}`,
        mediaCount: attachmentContext.mediaCtx.length
      })
    }

    const input = this.adapter.buildRunInput({
      submissionId: uuidv4(),
      envelope,
      modelRef: effectiveModelRef,
      chat,
      mediaCtx: attachmentContext.mediaCtx,
      attachmentTextBlocks: attachmentContext.documentTextBlocks
    })

    const result = await this.chatRunService.execute(input)
    const assistantMessage = result.assistantMessageId
      ? DatabaseService.getMessageById(result.assistantMessageId)
      : undefined
    const replyText = this.extractReplyText(assistantMessage)

    if (replyText && this.bot) {
      const formattedReply = formatTelegramRichText(replyText)
      this.logger.info('reply.prepared', {
        updateId: envelope.updateId,
        chatId: envelope.chatId,
        chatUuid: chat.uuid,
        parseMode: formattedReply.parseMode ?? 'plain',
        replyPreview: this.toPreview(replyText),
        formattedPreview: this.toPreview(formattedReply.text)
      })
      const sent = await this.bot.api.sendMessage(Number(envelope.chatId), formattedReply.text, {
        ...(formattedReply.parseMode ? { parse_mode: formattedReply.parseMode } : {}),
        ...(envelope.threadId ? { message_thread_id: Number(envelope.threadId) } : {}),
        ...(envelope.messageId ? { reply_parameters: { message_id: Number(envelope.messageId) } } : {})
      })

      if (assistantMessage) {
        DatabaseService.updateMessage({
          ...assistantMessage,
          body: {
            ...assistantMessage.body,
            source: 'telegram',
            host: this.adapter.buildOutboundHostMeta({
              envelope,
              sentMessageId: String(sent.message_id)
            })
          }
        })
      }
    }

    if (binding.id) {
      DatabaseService.updateChatHostBindingLastMessage(binding.id, envelope.messageId)
    }

    this.logger.info('update.accepted', {
      updateId: envelope.updateId,
      chatId: envelope.chatId,
      chatUuid: chat.uuid
    })
    this.lastMessageProcessedAt = Date.now()
  }

  private async performStart(args: {
    runId: number
    botToken: string
    defaultModel: ModelRef
  }): Promise<void> {
    const { runId, botToken, defaultModel } = args
    this.logger.info('perform_start.enter', {
      marker: TelegramGatewayService.IMPLEMENTATION_MARKER,
      runId
    })
    const bot = new Bot(botToken)
    bot.catch((error) => {
      this.lastError = error.error instanceof Error
        ? error.error.message
        : error.message
      this.lastErrorAt = Date.now()
      this.logger.error('handler.failed', error.error ?? error)
    })

    try {
      this.logger.info('start.get_me.pending', {
        runId,
        timeoutMs: TelegramGatewayService.START_TIMEOUT_MS
      })
      const me = await this.withTimeout(
        bot.api.getMe(),
        TelegramGatewayService.START_TIMEOUT_MS,
        'Telegram bot getMe'
      )

      if (runId !== this.startRunId) {
        this.logger.info('start.aborted', { runId, reason: 'superseded before getMe completion' })
        await bot.stop().catch(() => undefined)
        return
      }

      bot.botInfo = me
      this.logger.info('start.get_me.completed', {
        runId,
        botUsername: me.username,
        botId: String(me.id)
      })

      this.registerHandlers(bot, defaultModel)
      this.bot = bot
      this.lastUpdateId = 0
      this.botUsername = me.username
      this.botId = String(me.id)
      this.lastSuccessfulPollAt = undefined
      this.lastMessageProcessedAt = undefined
      const startTimeout = setTimeout(() => {
        if (runId !== this.startRunId || !this.starting || this.running) {
          return
        }
        this.lastError = `Telegram polling startup timed out after ${TelegramGatewayService.POLLING_START_TIMEOUT_MS}ms`
        this.lastErrorAt = Date.now()
        this.starting = false
        this.running = false
        this.bot = null
        this.logger.error('polling.start.timeout', {
          runId,
          timeoutMs: TelegramGatewayService.POLLING_START_TIMEOUT_MS
        })
        void bot.stop().catch(() => undefined)
      }, TelegramGatewayService.POLLING_START_TIMEOUT_MS)

      void bot.start({
        allowed_updates: ['message', 'callback_query'],
        onStart: async (botInfo) => {
          clearTimeout(startTimeout)
          if (runId !== this.startRunId) {
            this.logger.info('start.aborted', { runId, reason: 'superseded before onStart' })
            await bot.stop().catch(() => undefined)
            return
          }

          bot.botInfo = botInfo
          this.botUsername = botInfo.username
          this.botId = String(botInfo.id)
          this.starting = false
          this.running = true
          this.lastSuccessfulPollAt = Date.now()
          this.logger.info('start.completed', {
            runId,
            mode: 'polling',
            defaultModel: `${defaultModel.accountId}/${defaultModel.modelId}`,
            lastUpdateId: this.lastUpdateId,
            botUsername: this.botUsername,
            botId: this.botId
          })
          this.logger.info('polling.started', {
            runId,
            botUsername: this.botUsername,
            botId: this.botId
          })
        }
      }).catch((error) => {
        clearTimeout(startTimeout)
        if (runId !== this.startRunId) {
          return
        }
        this.lastError = error instanceof Error ? error.message : String(error)
        this.lastErrorAt = Date.now()
        this.starting = false
        this.running = false
        this.logger.error('polling.failed', error)
      })
    } catch (error) {
      if (runId !== this.startRunId) {
        this.logger.info('start.aborted', { runId, reason: 'superseded after failure' })
        return
      }
      this.lastError = error instanceof Error ? error.message : String(error)
      this.lastErrorAt = Date.now()
      this.starting = false
      this.running = false
      this.logger.error('start.failed', error)
    }
  }

  private extractReplyText(message?: MessageEntity): string {
    if (!message) {
      return ''
    }

    const fromSegments = message.body.segments?.length
      ? extractContentFromSegments(message.body.segments)
      : ''
    const fromContent = typeof message.body.content === 'string'
      ? message.body.content
      : ''
    const toolNames = this.extractToolNames(message)
    const toolsSummary = toolNames.length > 0
      ? `\n\n**Agent activity**\n${toolNames.map(name => `- ${name}`).join('\n')}`
      : ''

    return `${(fromSegments || fromContent || '').trim()}${toolsSummary}`.trim()
  }

  private shouldHandleEnvelope(envelope: TelegramInboundEnvelope): boolean {
    const config = this.appConfigStore.requireConfig().telegram
    if (!config?.enabled) {
      return false
    }

    if (config.allowedChatIds?.length && !config.allowedChatIds.includes(envelope.chatId)) {
      return false
    }

    if (envelope.chatType === 'private') {
      return config.dmPolicy !== 'disabled'
    }

    if (config.groupPolicy === 'disabled') {
      return false
    }

    if (config.requireMentionInGroups) {
      return envelope.isMentioned || envelope.replyToBot
    }

    return true
  }

  private shouldHandleCommand(envelope: TelegramInboundEnvelope): boolean {
    const config = this.appConfigStore.requireConfig().telegram
    if (!config?.enabled) {
      return false
    }

    if (config.allowedChatIds?.length && !config.allowedChatIds.includes(envelope.chatId)) {
      return false
    }

    if (envelope.chatType === 'private') {
      return config.dmPolicy !== 'disabled'
    }

    return config.groupPolicy !== 'disabled'
  }

  private extractToolNames(message: MessageEntity): string[] {
    const toolNames = new Set<string>()

    message.body.toolCalls?.forEach(toolCall => {
      const name = toolCall.function?.name?.trim()
      if (name) {
        toolNames.add(name)
      }
    })

    message.body.segments?.forEach(segment => {
      if (segment.type === 'toolCall' && typeof segment.name === 'string' && segment.name.trim()) {
        toolNames.add(segment.name.trim())
      }
    })

    return Array.from(toolNames)
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`))
          }, timeoutMs)
        })
      ])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  private registerHandlers(bot: Bot, modelRef: ModelRef): void {
    bot.on('callback_query:data', async (ctx) => {
      this.lastSuccessfulPollAt = Date.now()
      this.logger.info('callback_query.received', {
        updateId: ctx.update.update_id,
        data: ctx.callbackQuery.data,
        fromUserId: ctx.from?.id ? String(ctx.from.id) : undefined
      })
      const callback = parseTelegramCommandCallback(ctx.callbackQuery.data)
      if (!callback) {
        return
      }

      const message = ctx.callbackQuery.message
      if (!message?.chat || !message.message_id) {
        await ctx.answerCallbackQuery().catch(() => undefined)
        return
      }

      const envelope: TelegramInboundEnvelope = {
        updateId: ctx.update.update_id,
        messageId: String(message.message_id),
        chatId: String(message.chat.id),
        chatType: message.chat.type,
        threadId: 'message_thread_id' in message && typeof message.message_thread_id === 'number'
          ? String(message.message_thread_id)
          : undefined,
        fromUserId: ctx.from?.id ? String(ctx.from.id) : undefined,
        username: ctx.from?.username,
        displayName: ctx.from?.first_name || undefined,
        text: '',
        media: [],
        isMentioned: false,
        replyToBot: false,
        receivedAt: Date.now()
      }

      if (!this.shouldHandleCommand(envelope)) {
        await ctx.answerCallbackQuery({ text: 'Command is not allowed in this chat.' }).catch(() => undefined)
        return
      }

      const response = await this.commandService.executeCallback(callback, envelope, modelRef)
      await ctx.editMessageText(response.text, {
        ...(response.parseMode ? { parse_mode: response.parseMode } : {}),
        ...(response.inlineKeyboard ? {
          reply_markup: {
            inline_keyboard: response.inlineKeyboard.map((row) =>
              row.map((button) => ({
                text: button.text,
                callback_data: button.callbackData
              }))
            )
          }
        } : {})
      })
      await ctx.answerCallbackQuery().catch(() => undefined)
    })

    bot.on('message', async (ctx) => {
      this.lastSuccessfulPollAt = Date.now()
      this.lastUpdateId = ctx.update.update_id

      const envelope = TelegramUpdateMapper.fromContext(ctx, this.botUsername)
      if (!envelope) {
        this.logger.info('update.ignored', {
          updateId: ctx.update.update_id,
          reason: 'unsupported or empty message'
        })
        return
      }

      const command = parseTelegramCommand(envelope.text, this.botUsername)
      if (command) {
        if (!this.shouldHandleCommand(envelope)) {
          this.logger.info('update.ignored', {
            updateId: envelope.updateId,
            chatId: envelope.chatId,
            reason: 'command policy filtered',
            command: command.name
          })
          return
        }

        await this.handleCommand(envelope, command, modelRef)
        return
      }

      if (!this.shouldHandleEnvelope(envelope)) {
        this.logger.info('update.ignored', {
          updateId: envelope.updateId,
          chatId: envelope.chatId,
          reason: 'policy filtered'
        })
        return
      }

      await this.handleEnvelope(envelope, modelRef)
    })
  }

  private resolveModelRefForChat(chat: ChatEntity, defaultModelRef: ModelRef): ModelRef {
    const config = this.appConfigStore.requireConfig()
    return resolveExistingChatModelRef(config, chat) ?? defaultModelRef
  }
}
