import { v4 as uuidv4 } from 'uuid'
import { net } from 'electron'
import { Bot } from 'grammy'
import { configDb } from '@main/db/config'
import { RunService } from '@main/orchestration/chat/run'
import type { RunResult } from '@main/agent/contracts'
import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import { TelegramAgentAdapter, type TelegramInboundEnvelope } from '@main/hosts/telegram'
import { TelegramRenderResponder } from '@main/hosts/telegram/runtime'
import { chatDb } from '@main/db/chat'
import { createLogger } from '@main/logging/LogService'
import type { ToolConfirmation, TelegramConfirmationTarget } from '@shared/tools/confirmation'
import { TelegramUpdateMapper } from './TelegramUpdateMapper'
import { TelegramFileService } from './TelegramFileService'
import { TelegramCommandService } from './TelegramCommandService'
import { parseTelegramCommand, parseTelegramCommandCallback } from './telegram-command-parser'
import {
  resolveExistingChatModelRef,
  resolveMainModelRef
} from '@shared/services/ChatModelResolver'

export class TelegramGatewayService {
  private static readonly IMPLEMENTATION_MARKER = 'telegram-gateway-dev-marker-2026-03-25-v2'
  private readonly logger = createLogger('TelegramGatewayService')
  private readonly adapter = new TelegramAgentAdapter()
  private readonly appConfigStore = new AppConfigStore()
  private readonly modelResolver = new ChatModelContextResolver()
  private readonly runService = new RunService()
  private readonly fileService = new TelegramFileService()
  private readonly commandService = new TelegramCommandService(
    undefined, undefined, undefined, undefined, this.runService
  )
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

  private readonly confirmationMessages = new Map<string, {
    descriptor: ToolConfirmation
    envelope: Pick<TelegramInboundEnvelope, 'chatId' | 'threadId' | 'messageId'>
    messageId?: number
    appliedVersion: number
  }>()
  private confirmationQueue: Promise<void> = Promise.resolve()
  private confirmationRetry?: NodeJS.Timeout

  constructor() {
    this.runService.subscribeToolConfirmations((descriptor, targets) => {
      for (const target of targets) {
        void this.trackConfirmation(descriptor, { chatId: target.peerId, threadId: target.threadId, messageId: '' })
      }
    })
  }

  private canDeliverApproval(target: TelegramConfirmationTarget): boolean {
    const config = this.appConfigStore.getConfig()?.telegram
    if (!config?.enabled || (config.allowedChatIds?.length && !config.allowedChatIds.includes(target.peerId))) return false
    return target.peerId.startsWith('-') ? config.groupPolicy !== 'disabled' : config.dmPolicy !== 'disabled'
  }

  private trackConfirmation(
    descriptor: ToolConfirmation,
    envelope: Pick<TelegramInboundEnvelope, 'chatId' | 'threadId' | 'messageId'>
  ): Promise<void> {
    const key = JSON.stringify([descriptor.confirmationId, envelope.chatId, envelope.threadId ?? null])
    const existing = this.confirmationMessages.get(key)
    if (existing && descriptor.version <= existing.descriptor.version) return Promise.resolve()
    this.confirmationMessages.set(key, {
      descriptor, envelope, messageId: existing?.messageId, appliedVersion: existing?.appliedVersion ?? 0
    })
    return this.queueConfirmationSync()
  }

  private queueConfirmationSync(): Promise<void> {
    this.confirmationQueue = this.confirmationQueue.then(() => this.syncConfirmationMessages())
    return this.confirmationQueue
  }

  private async syncConfirmationMessages(): Promise<void> {
    const bot = this.bot
    if (!bot) return
    let retry = false
    for (const [id, entry] of this.confirmationMessages) {
      if (entry.appliedVersion >= entry.descriptor.version || !this.canDeliverApproval({ peerId: entry.envelope.chatId, threadId: entry.envelope.threadId })) continue
      try {
        if (!entry.messageId) {
          const descriptor = entry.descriptor
          const sent = await bot.api.sendMessage(
            Number(entry.envelope.chatId),
            this.confirmationText(descriptor),
            {
              parse_mode: 'HTML',
              ...(entry.envelope.threadId ? { message_thread_id: Number(entry.envelope.threadId) } : {}),
              ...(entry.envelope.messageId ? { reply_parameters: { message_id: Number(entry.envelope.messageId) } } : {}),
              reply_markup: { inline_keyboard: this.confirmationKeyboard(descriptor) }
            }
          )
          // A decision may arrive while sendMessage is in flight.
          const current = this.confirmationMessages.get(id)!
          current.messageId = sent.message_id
          current.appliedVersion = descriptor.version
        }
        const current = this.confirmationMessages.get(id)!
        if (current.appliedVersion < current.descriptor.version) {
          const descriptor = current.descriptor
          try {
            await bot.api.editMessageText(Number(current.envelope.chatId), current.messageId!, this.confirmationText(descriptor), {
              parse_mode: 'HTML', reply_markup: { inline_keyboard: this.confirmationKeyboard(descriptor) }
            })
          } catch (error) {
            if (!(error instanceof Error) || !error.message.toLowerCase().includes('message is not modified')) throw error
          }
          current.appliedVersion = descriptor.version
        }
      } catch (error) {
        retry = true
        this.logger.warn('tool_confirmation.sync_failed', {
          confirmationId: id, error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    const settled = [...this.confirmationMessages.entries()].filter(([, entry]) => (
      entry.descriptor.status !== 'pending'
    ))
    for (const [id] of settled.slice(0, Math.max(0, settled.length - 500))) this.confirmationMessages.delete(id)
    if (retry && this.bot === bot && !this.confirmationRetry) {
      this.confirmationRetry = setTimeout(() => {
        this.confirmationRetry = undefined
        void this.queueConfirmationSync()
      }, 5_000)
      this.confirmationRetry.unref()
    }
  }

  private confirmationText(descriptor: ToolConfirmation): string {
    const status = {
      pending: 'needs approval', approved: 'approved', denied: 'denied', expired: 'approval expired', cancelled: 'approval cancelled'
    }[descriptor.status]
    return `<blockquote>${this.escapeHtml(`tool ${this.formatToolLabel(descriptor.name)} ${status}`)}</blockquote>`
  }

  private confirmationKeyboard(descriptor: ToolConfirmation): Array<Array<{ text: string; callback_data: string }>> {
    return descriptor.status === 'pending' ? [[
      { text: 'Approve', callback_data: `tgcmd:tool_confirm:approve:${descriptor.confirmationId}` },
      { text: 'Deny', callback_data: `tgcmd:tool_confirm:deny:${descriptor.confirmationId}` }
    ]] : []
  }

  private formatToolLabel(toolName: string): string {
    return toolName.replace(/_/g, ' ')
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  private buildChatKey(envelope: TelegramInboundEnvelope): string {
    return envelope.threadId
      ? `${envelope.chatId}:${envelope.threadId}`
      : envelope.chatId
  }

  private resolveFetch(): typeof fetch {
    if (typeof net?.fetch === 'function') {
      return net.fetch.bind(net) as typeof fetch
    }
    return fetch
  }

  private toPreview(value: string, limit = 400): string {
    const normalized = value.replace(/\r\n?/g, '\n').trim()
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized
  }

  private persistBotIdentity(botToken: string, botProfile: { botUsername?: string; botId?: string }): void {
    try {
      const config = this.appConfigStore.getConfig()
      if (!config?.telegram?.botToken || config.telegram.botToken !== botToken) {
        return
      }

      configDb.saveConfig({
        ...config,
        telegram: {
          ...config.telegram,
          botUsername: botProfile.botUsername,
          botId: botProfile.botId
        }
      })
    } catch (error) {
      this.logger.warn('bot_identity.persist_failed', {
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  getStatus(): {
    running: boolean
    starting: boolean
    configured: boolean
    enabled: boolean
    mode?: 'polling' | 'webhook'
    hasMainModel: boolean
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
    const mainModel = appConfig ? resolveMainModelRef(appConfig) : undefined
    const hasMainModel = Boolean(mainModel && this.modelResolver.resolve(appConfig ?? {}, mainModel))

    return {
      running: this.running,
      starting: this.starting,
      configured: Boolean(telegram?.botToken),
      enabled: Boolean(telegram?.enabled),
      mode: telegram?.mode,
      hasMainModel,
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
    const mainModel = resolveMainModelRef(appConfig)

    if (!config?.enabled || !config.botToken) {
      this.logger.info('start.skipped', { reason: 'telegram not configured' })
      return
    }

    if (!mainModel || !this.modelResolver.resolve(appConfig, mainModel)) {
      this.logger.warn('start.skipped', { reason: 'main model unavailable for telegram' })
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
      mainModel
    })
  }

  async startWithToken(botToken: string): Promise<void> {
    const token = botToken.trim()
    if (!token) {
      throw new Error('Telegram bot token is required')
    }

    const appConfig = this.appConfigStore.requireConfig()
    const mainModel = resolveMainModelRef(appConfig)

    if (!mainModel || !this.modelResolver.resolve(appConfig, mainModel)) {
      throw new Error('Main model unavailable for telegram')
    }

    if (this.running || this.starting) {
      this.stop()
    }

    this.starting = true
    this.lastError = undefined
    this.lastErrorAt = undefined
    this.startRunId += 1
    const currentRunId = this.startRunId

    this.logger.info('setup.start.queued', {
      runId: currentRunId,
      mode: 'polling'
    })

    await this.performStart({
      runId: currentRunId,
      botToken: token,
      mainModel,
      awaitReady: true
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
    if (this.confirmationRetry) clearTimeout(this.confirmationRetry)
    this.confirmationRetry = undefined
    this.logger.info('stopped')
  }

  async testConnection(botToken?: string): Promise<{ ok: boolean; username?: string; id?: string; error?: string }> {
    try {
      const config = this.appConfigStore.getConfig()?.telegram
      const token = botToken?.trim() || config?.botToken
      if (!token) {
        return { ok: false, error: 'Telegram bot token is required' }
      }

      const bot = new Bot(token, {
        client: {
          fetch: this.resolveFetch()
        }
      })
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

  private async sendTypingAction(envelope: TelegramInboundEnvelope): Promise<void> {
    const bot = this.bot
    if (!bot) {
      return
    }

    try {
      await bot.api.sendChatAction(Number(envelope.chatId), 'typing', {
        ...(envelope.threadId ? { message_thread_id: Number(envelope.threadId) } : {})
      })
    } catch (error) {
      this.logger.warn('typing_action.failed', {
        updateId: envelope.updateId,
        chatId: envelope.chatId,
        threadId: envelope.threadId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async handleCommand(
    envelope: TelegramInboundEnvelope,
    command: NonNullable<ReturnType<typeof parseTelegramCommand>>,
    mainModelRef: ModelRef
  ): Promise<void> {
    const response = await this.commandService.execute(command, envelope, mainModelRef)
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

  private async handleEnvelope(envelope: TelegramInboundEnvelope, mainModelRef: ModelRef): Promise<void> {
    this.logger.info('update.received', {
      updateId: envelope.updateId,
      chatId: envelope.chatId,
      chatType: envelope.chatType,
      threadId: envelope.threadId,
      username: envelope.username,
      textPreview: this.toPreview(envelope.text),
      mediaKinds: envelope.media.map((item) => item.kind)
    })

    void this.sendTypingAction(envelope)

    const chatKey = this.buildChatKey(envelope)
    if (this.commandService.hasActiveSubmission(chatKey)) {
      await this.bot?.api.sendMessage(Number(envelope.chatId), 'Previous request is still stopping. Please wait a moment.', {
        ...(envelope.threadId ? { message_thread_id: Number(envelope.threadId) } : {}),
        ...(envelope.messageId ? { reply_parameters: { message_id: Number(envelope.messageId) } } : {})
      }).catch((error) => {
        this.logger.warn('active_run_notice.failed', {
          updateId: envelope.updateId,
          chatId: envelope.chatId,
          error: error instanceof Error ? error.message : String(error)
        })
      })
      this.lastMessageProcessedAt = Date.now()
      return
    }

    const { chat, binding, created } = await this.adapter.resolveOrCreateSession(envelope, mainModelRef)
    const chatModelRef = this.resolveModelRefForChat(chat, mainModelRef)
    const attachmentContext = this.bot
      ? await this.fileService.buildAttachmentContext(this.bot, envelope)
      : { mediaCtx: [], documentTextBlocks: [] }
    const appConfig = this.appConfigStore.requireConfig()
    const modelContext = this.modelResolver.resolve(appConfig, chatModelRef)

    this.logger.info('model.selected', {
      updateId: envelope.updateId,
      chatId: envelope.chatId,
      chatUuid: chat.uuid,
      created,
      model: `${chatModelRef.accountId}/${chatModelRef.modelId}`,
      modelType: modelContext?.model.type,
      mediaCount: attachmentContext.mediaCtx.length
    })

    const input = this.adapter.buildRunInput({
      submissionId: uuidv4(),
      envelope,
      modelRef: chatModelRef,
      chatModelRef,
      chat,
      mediaCtx: attachmentContext.mediaCtx,
      attachmentTextBlocks: attachmentContext.documentTextBlocks
    })

    this.commandService.registerActiveSubmission(chatKey, input.submissionId)

    const responder = this.bot
      ? new TelegramRenderResponder({
        bot: this.bot,
        envelope,
        logger: this.logger
      })
      : null

    void (async (): Promise<RunResult> => this.runService.submit(input, {
      ...(responder ? { hostRenderSinks: [responder] } : {})
    }).completion)()
      .then(() => {
        if (binding.id) {
          chatDb.updateChatHostBindingLastMessage(binding.id, envelope.messageId)
        }

        this.logger.info('update.accepted', {
          updateId: envelope.updateId,
          chatId: envelope.chatId,
          chatUuid: chat.uuid
        })
      })
      .catch((error) => {
        this.logger.error('update.run_failed', error)
      })
      .finally(() => {
        this.commandService.unregisterActiveSubmission(chatKey, input.submissionId)
      })

    this.lastMessageProcessedAt = Date.now()
  }

  private async performStart(args: {
    runId: number
    botToken: string
    mainModel: ModelRef
    awaitReady?: boolean
  }): Promise<void> {
    const { runId, botToken, mainModel, awaitReady = false } = args
    this.logger.info('perform_start.enter', {
      marker: TelegramGatewayService.IMPLEMENTATION_MARKER,
      runId
    })
    const bot = new Bot(botToken, {
      client: {
        fetch: this.resolveFetch()
      }
    })
    let readySettled = false
    let resolveReady: () => void = () => undefined
    let rejectReady: (error: Error) => void = () => undefined
    const readyPromise = awaitReady
      ? new Promise<void>((resolve, reject) => {
        resolveReady = () => {
          if (readySettled) return
          readySettled = true
          resolve()
        }
        rejectReady = (error: Error) => {
          if (readySettled) return
          readySettled = true
          reject(error)
        }
      })
      : null

    const toError = (error: unknown): Error => {
      return error instanceof Error ? error : new Error(String(error))
    }

    const failStart = (event: string, error: unknown): void => {
      if (runId !== this.startRunId) {
        rejectReady?.(new Error('Telegram startup superseded'))
        return
      }

      const normalized = toError(error)
      this.lastError = normalized.message
      this.lastErrorAt = Date.now()
      this.starting = false
      this.running = false
      if (this.bot === bot) {
        this.bot = null
      }
      rejectReady?.(normalized)
      this.logger.error(event, normalized)
    }

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
        rejectReady(new Error('Telegram startup superseded'))
        await bot.stop().catch(() => undefined)
        return
      }

      bot.botInfo = me
      this.logger.info('start.get_me.completed', {
        runId,
        botUsername: me.username,
        botId: String(me.id)
      })

      this.registerHandlers(bot, mainModel)
      this.bot = bot
      this.lastUpdateId = 0
      this.botUsername = me.username
      this.botId = String(me.id)
      this.persistBotIdentity(botToken, {
        botUsername: this.botUsername,
        botId: this.botId
      })
      this.lastSuccessfulPollAt = undefined
      this.lastMessageProcessedAt = undefined
      const startTimeout = setTimeout(() => {
        if (runId !== this.startRunId || !this.starting || this.running) {
          return
        }
        const timeoutError = new Error(
          `Telegram polling startup timed out after ${TelegramGatewayService.POLLING_START_TIMEOUT_MS}ms`
        )
        this.logger.error('polling.start.timeout', {
          runId,
          timeoutMs: TelegramGatewayService.POLLING_START_TIMEOUT_MS
        })
        failStart('polling.start.timeout', timeoutError)
        void bot.stop().catch(() => undefined)
      }, TelegramGatewayService.POLLING_START_TIMEOUT_MS)

      void bot.start({
        allowed_updates: ['message', 'callback_query'],
        onStart: async (botInfo) => {
          clearTimeout(startTimeout)
          if (runId !== this.startRunId) {
            this.logger.info('start.aborted', { runId, reason: 'superseded before onStart' })
            rejectReady(new Error('Telegram startup superseded'))
            await bot.stop().catch(() => undefined)
            return
          }

          bot.botInfo = botInfo
          this.botUsername = botInfo.username
          this.botId = String(botInfo.id)
          this.persistBotIdentity(botToken, {
            botUsername: this.botUsername,
            botId: this.botId
          })
          this.starting = false
          this.running = true
          void this.queueConfirmationSync()
          this.lastSuccessfulPollAt = Date.now()
          this.logger.info('start.completed', {
            runId,
            mode: 'polling',
            mainModel: `${mainModel.accountId}/${mainModel.modelId}`,
            lastUpdateId: this.lastUpdateId,
            botUsername: this.botUsername,
            botId: this.botId
          })
          this.logger.info('polling.started', {
            runId,
            botUsername: this.botUsername,
            botId: this.botId
          })
          resolveReady()
        }
      }).catch((error) => {
        clearTimeout(startTimeout)
        failStart('polling.failed', error)
      })

      if (readyPromise) {
        await readyPromise
      }
    } catch (error) {
      if (runId !== this.startRunId) {
        this.logger.info('start.aborted', { runId, reason: 'superseded after failure' })
        rejectReady(new Error('Telegram startup superseded'))
        return
      }
      failStart('start.failed', error)
    }
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

      if (callback.type === 'tool_confirmation') {
        const result = this.runService.submitTelegramToolConfirmation(callback.confirmationId, {
          approved: callback.approved,
          reason: callback.approved ? undefined : 'denied from telegram'
        }, {
          host: 'telegram', peerId: envelope.chatId, threadId: envelope.threadId, userId: envelope.fromUserId
        })
        const descriptor = result.confirmation
        const text = descriptor
          ? { pending: 'Pending.', approved: 'Approved.', denied: 'Denied.', expired: 'Approval expired.', cancelled: 'Approval cancelled.' }[descriptor.status]
          : result.ok ? 'Approved.' : result.reason === 'identity_mismatch'
            ? 'This approval belongs to another chat or topic.'
            : 'Approval expired or is no longer available.'
        await ctx.answerCallbackQuery({ text }).catch(() => undefined)
        if (descriptor || (!result.ok && result.reason === 'not_found')) {
          await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => undefined)
        }
        // Resolved events update every host; also reconcile after a duplicate/expired click.
        void this.queueConfirmationSync()
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

  private resolveModelRefForChat(chat: ChatEntity, mainModelRef: ModelRef): ModelRef {
    const config = this.appConfigStore.requireConfig()
    return resolveExistingChatModelRef(config, chat) ?? mainModelRef
  }
}
