import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import { TelegramAgentAdapter, type TelegramInboundEnvelope } from '@main/hosts/telegram'
import { HostChatBindingService } from '@main/hosts/shared/HostChatBindingService'
import { RunService } from '@main/orchestration/chat/run'
import DatabaseService from '@main/db/DatabaseService'
import { embeddedToolsRegistry } from '@tools/registry'
import { getDefaultWorkspacePath } from '@shared/workspace/workspacePaths'
import type { TelegramCommand, TelegramCommandCallback } from './telegram-command-parser'

const MAX_MESSAGE_LENGTH = 3500
const MODELS_PAGE_SIZE = 5
const TOOLS_PAGE_SIZE = 12

type TelegramModelListItem = {
  account: ProviderAccount
  model: AccountModel
  provider?: ProviderDefinition
}

const truncateMessage = (value: string, limit = MAX_MESSAGE_LENGTH): string =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value

const isEnabledModel = (model: AccountModel): boolean => model.enabled !== false
const isSameModelRef = (left?: ModelRef, right?: ModelRef): boolean =>
  Boolean(left && right && left.accountId === right.accountId && left.modelId === right.modelId)
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const normalizeLookupToken = (value: string): string => value.trim().toLowerCase()
const normalizeProviderToken = (value: string): string => normalizeLookupToken(value).replace(/\s+/g, '-')

export type TelegramCommandResponse = {
  text: string
  parseMode?: 'HTML'
  inlineKeyboard?: Array<Array<{ text: string; callbackData: string }>>
}

export class TelegramCommandService {
  private readonly activeRuns = new Map<string, string>()

  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly modelResolver = new ChatModelContextResolver(),
    private readonly adapter = new TelegramAgentAdapter(),
    private readonly hostChatBindingService = new HostChatBindingService(),
    private readonly runService = new RunService()
  ) {}

  registerActiveSubmission(chatKey: string, submissionId: string): void {
    this.activeRuns.set(chatKey, submissionId)
  }

  unregisterActiveSubmission(chatKey: string, submissionId: string): void {
    if (this.activeRuns.get(chatKey) === submissionId) {
      this.activeRuns.delete(chatKey)
    }
  }

  hasActiveSubmission(chatKey: string): boolean {
    return this.activeRuns.has(chatKey)
  }

  async execute(command: TelegramCommand, envelope: TelegramInboundEnvelope, mainModelRef: ModelRef): Promise<TelegramCommandResponse> {
    switch (command.name) {
      case 'newchat':
        return await this.handleNewChat(envelope, mainModelRef)
      case 'models':
        return await this.handleModels(envelope, mainModelRef, 0)
      case 'model':
        return await this.handleModel(command.args, envelope, mainModelRef)
      case 'tools':
        return this.handleTools(0)
      case 'workspace':
        return await this.handleWorkspace(command.args, envelope, mainModelRef)
      case 'status':
        return await this.handleStatus(envelope, mainModelRef)
      case 'stop':
        return this.handleStop(envelope)
      case 'help':
        return this.handleHelp()
      default:
        return this.handleHelp()
    }
  }

  async executeCallback(
    callback: TelegramCommandCallback,
    envelope: TelegramInboundEnvelope,
    mainModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    switch (callback.type) {
      case 'models':
        return await this.handleModels(envelope, mainModelRef, callback.page)
      case 'tools':
        return this.handleTools(callback.page)
      default:
        return this.handleHelp()
    }
  }

  private async handleNewChat(envelope: TelegramInboundEnvelope, mainModelRef: ModelRef): Promise<TelegramCommandResponse> {
    const created = await this.hostChatBindingService.createAndBind({
      hostType: 'telegram',
      hostChatId: envelope.chatId,
      hostThreadId: envelope.threadId,
      hostUserId: envelope.fromUserId,
      title: 'NewChat',
      modelRef: mainModelRef,
      metadata: {
        chatType: envelope.chatType,
        username: envelope.username,
        displayName: envelope.displayName
      }
    })

    const modelLabel = this.resolveModelLabel(mainModelRef) ?? mainModelRef.modelId

    return { text: [
      'Started a new chat.',
      `Chat: ${created.chat.uuid}`,
      `Model: ${modelLabel}`
    ].join('\n') }
  }

  private async handleModels(
    envelope: TelegramInboundEnvelope,
    mainModelRef: ModelRef,
    page: number
  ): Promise<TelegramCommandResponse> {
    const { chat } = await this.adapter.resolveOrCreateSession(envelope, mainModelRef)
    const models = this.getAvailableModels()

    if (models.length === 0) {
      return { text: 'No models are available.' }
    }

    const totalPages = Math.max(1, Math.ceil(models.length / MODELS_PAGE_SIZE))
    const safePage = Math.min(page, totalPages - 1)
    const start = safePage * MODELS_PAGE_SIZE
    const pageItems = models.slice(start, start + MODELS_PAGE_SIZE)

    const lines = pageItems.map((item, index) => {
      const current = isSameModelRef(chat.modelRef, {
        accountId: item.account.id,
        modelId: item.model.id
      })
        ? ' <b>(current)</b>'
        : ''
      const providerLabel = item.provider?.displayName ?? item.account.providerId
      return [
        `${start + index + 1}. <b>${escapeHtml(item.model.label)}</b> <i>[${escapeHtml(item.model.type)}]</i>${current}`,
        `<pre>${escapeHtml(item.model.id)}</pre>`,
        `${escapeHtml(providerLabel)} · ${escapeHtml(item.account.label)}`,
        `<pre>${escapeHtml(this.buildModelSwitchCommand(item))}</pre>`
      ].join('\n')
    })

    return {
      text: truncateMessage([
        `<b>Available models</b>`,
        `Page ${safePage + 1}/${totalPages}`,
        '',
        ...lines.flatMap((line) => [line, '']),
        'Use <pre>/model &lt;provider&gt; &lt;model id&gt;</pre> to switch models.'
      ].join('\n').trim()),
      parseMode: 'HTML',
      inlineKeyboard: this.buildPagerKeyboard('models', safePage, totalPages)
    }
  }

  private async handleModel(
    args: string,
    envelope: TelegramInboundEnvelope,
    mainModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    const { chat } = await this.adapter.resolveOrCreateSession(envelope, mainModelRef)

    if (!args.trim()) {
      const currentLabel = chat.modelRef
        ? (this.resolveModelLabel(chat.modelRef) ?? chat.modelRef.modelId)
        : 'unset'
      return { text: [
        `Current model: ${currentLabel}`,
        'Usage: /model <provider> <model id>',
        'Use /models to copy the exact command.'
      ].join('\n') }
    }

    const models = this.getAvailableModels()
    const parsedArgs = this.parseModelCommandArgs(args)
    const hasProviderMatch = parsedArgs.provider
      ? this.hasProviderMatch(parsedArgs.provider, models)
      : false
    const matches = parsedArgs.provider && hasProviderMatch
      ? this.findMatchingModelsByProvider(parsedArgs.provider, parsedArgs.modelQuery, models)
      : this.findMatchingModels(args, models)

    if (matches.length === 0) {
      return { text: `Model match missing for "${args}". Use /models to copy the exact command.` }
    }

    if (matches.length > 1) {
      const prompt = parsedArgs.provider && hasProviderMatch
        ? 'Please use a provider/account token from /models.'
        : 'Please use /model <provider> <model id>.'
      return { text: truncateMessage([
        `Multiple models matched "${args}":`,
        ...matches.map((item) => `- ${this.describeModelForPlainText(item)} · ${this.buildModelSwitchCommand(item)}`),
        prompt
      ].join('\n')) }
    }

    const match = matches[0]
    DatabaseService.updateChat({
      ...chat,
      modelRef: {
        accountId: match.account.id,
        modelId: match.model.id
      },
      updateTime: Date.now()
    })

    return { text: [
      'Chat model updated.',
      `Model: ${match.model.label} [${match.model.type}]`,
      `Provider: ${this.describeProviderForPlainText(match)}`,
      `Account: ${match.account.label}`,
      `Command: ${this.buildModelSwitchCommand(match)}`
    ].join('\n') }
  }

  private handleTools(page: number): TelegramCommandResponse {
    const toolNames = embeddedToolsRegistry.getAllToolDefinitions()
      .map((tool) => tool.function.name)
      .sort((a, b) => a.localeCompare(b))

    const totalPages = Math.max(1, Math.ceil(toolNames.length / TOOLS_PAGE_SIZE))
    const safePage = Math.min(page, totalPages - 1)
    const start = safePage * TOOLS_PAGE_SIZE
    const pageItems = toolNames.slice(start, start + TOOLS_PAGE_SIZE)

    return {
      text: truncateMessage([
        '<b>Available tools</b>',
        `Page ${safePage + 1}/${totalPages}`,
        '',
        ...pageItems.map((name) => `- <code>${escapeHtml(name)}</code>`)
      ].join('\n')),
      parseMode: 'HTML',
      inlineKeyboard: this.buildPagerKeyboard('tools', safePage, totalPages)
    }
  }

  private async handleWorkspace(
    args: string,
    envelope: TelegramInboundEnvelope,
    mainModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    const parts = args.trim().split(/\s+/)
    const subcommand = parts[0]?.toLowerCase()
    const subArgs = parts.slice(1).join(' ').trim()

    switch (subcommand) {
      case 'get':
        return await this.handleWorkspaceGet(envelope, mainModelRef)
      case 'set':
        return await this.handleWorkspaceSet(subArgs, envelope, mainModelRef)
      case 'clear':
        return await this.handleWorkspaceClear(envelope, mainModelRef)
      default:
        return { text: [
          'Usage:',
          '/workspace get - Show current workspace path',
          '/workspace set <path> - Set workspace to the given path',
          '/workspace clear - Reset to default workspace'
        ].join('\n') }
    }
  }

  private async handleWorkspaceGet(
    envelope: TelegramInboundEnvelope,
    mainModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    const { chat } = await this.adapter.resolveOrCreateSession(envelope, mainModelRef)
    const workspacePath = chat.workspacePath ?? getDefaultWorkspacePath(chat.uuid)
    return { text: `Current workspace: ${workspacePath}` }
  }

  private async handleWorkspaceSet(
    inputPath: string,
    envelope: TelegramInboundEnvelope,
    mainModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    if (!inputPath) {
      return { text: 'Usage: /workspace set <path>' }
    }

    const resolvedPath = path.isAbsolute(inputPath)
      ? inputPath
      : path.join(app.getPath('userData'), inputPath)

    try {
      const stat = await fs.stat(resolvedPath)
      if (!stat.isDirectory()) {
        return { text: `Path is not a directory: ${inputPath}` }
      }
    } catch {
      return { text: `Path does not exist: ${inputPath}` }
    }

    const { chat } = await this.adapter.resolveOrCreateSession(envelope, mainModelRef)
    DatabaseService.updateChat({ ...chat, workspacePath: inputPath, updateTime: Date.now() })

    return { text: `Workspace updated.\nPath: ${inputPath}` }
  }

  private async handleWorkspaceClear(
    envelope: TelegramInboundEnvelope,
    mainModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    const { chat } = await this.adapter.resolveOrCreateSession(envelope, mainModelRef)
    const defaultPath = getDefaultWorkspacePath(chat.uuid)
    DatabaseService.updateChat({ ...chat, workspacePath: defaultPath, updateTime: Date.now() })
    return { text: `Workspace reset to default.\nPath: ${defaultPath}` }
  }

  private async handleStatus(envelope: TelegramInboundEnvelope, mainModelRef: ModelRef): Promise<TelegramCommandResponse> {
    const { chat, binding } = await this.adapter.resolveOrCreateSession(envelope, mainModelRef)
    const currentModel = chat.modelRef ? this.findModelByRef(chat.modelRef, this.getAvailableModels()) : undefined
    const modelLabel = chat.modelRef
      ? (this.resolveModelLabel(chat.modelRef) ?? chat.modelRef.modelId)
      : 'unset'

    return { text: [
      'Telegram chat status',
      `Chat UUID: ${chat.uuid}`,
      `Title: ${chat.title}`,
      `Model: ${modelLabel}`,
      ...(currentModel ? [
        `Provider: ${this.describeProviderForPlainText(currentModel)}`,
        `Account: ${currentModel.account.label}`,
        `Command: ${this.buildModelSwitchCommand(currentModel)}`
      ] : []),
      `Binding: ${binding.hostType}:${binding.hostChatId}${binding.hostThreadId ? `:${binding.hostThreadId}` : ''}`
    ].join('\n') }
  }

  private handleStop(envelope: TelegramInboundEnvelope): TelegramCommandResponse {
    const chatKey = this.buildChatKey(envelope)
    const submissionId = this.activeRuns.get(chatKey)

    if (!submissionId) {
      return { text: 'No active request to stop.' }
    }

    this.runService.cancel(submissionId)

    return { text: 'Stopped current generation session.' }
  }

  private handleHelp(): TelegramCommandResponse {
    return { text: [
      'Available commands:',
      '/newchat - Start a new chat with the main model',
      '/models - List all available models',
      '/model <provider> <model-id> - Set the current chat model',
      '/tools - List available tools',
      '/workspace get|set|clear - Manage the current workspace',
      '/status - Show current chat and model status',
      '/stop - Stop the current generation session',
      '/help - Show bot commands and usage'
    ].join('\n') }
  }

  private buildChatKey(envelope: TelegramInboundEnvelope): string {
    return envelope.threadId
      ? `${envelope.chatId}:${envelope.threadId}`
      : envelope.chatId
  }

  private getAvailableModels(): TelegramModelListItem[] {
    const config = this.appConfigStore.requireConfig()
    const result: TelegramModelListItem[] = []

    for (const account of config.accounts ?? []) {
      const provider = config.providerDefinitions?.find((item) => item.id === account.providerId)
      if (provider?.enabled === false) {
        continue
      }

      for (const model of account.models ?? []) {
        if (isEnabledModel(model)) {
          result.push({ account, model, provider })
        }
      }
    }

    return result
  }

  private parseModelCommandArgs(args: string): { provider?: string; modelQuery: string } {
    const trimmed = args.trim()
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 2) {
      return {
        provider: parts[0],
        modelQuery: parts.slice(1).join(' ').trim()
      }
    }

    return { modelQuery: trimmed }
  }

  private findMatchingModels(
    query: string,
    models: TelegramModelListItem[]
  ): TelegramModelListItem[] {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return []
    }

    const exactIdMatches = models.filter(({ model }) => model.id.toLowerCase() === normalized)
    if (exactIdMatches.length > 0) {
      return exactIdMatches
    }

    const exactLabelMatches = models.filter(({ model }) => model.label.toLowerCase() === normalized)
    if (exactLabelMatches.length > 0) {
      return exactLabelMatches
    }

    return models.filter(({ model }) =>
      model.id.toLowerCase().includes(normalized) || model.label.toLowerCase().includes(normalized)
    )
  }

  private findMatchingModelsByProvider(
    providerQuery: string | undefined,
    modelQuery: string,
    models: TelegramModelListItem[]
  ): TelegramModelListItem[] {
    const normalizedModel = normalizeLookupToken(modelQuery)
    if (!providerQuery || !normalizedModel) {
      return []
    }

    const providerMatches = models.filter((item) => this.matchesProviderToken(providerQuery, item))
    const exactIdMatches = providerMatches.filter(({ model }) => normalizeLookupToken(model.id) === normalizedModel)
    if (exactIdMatches.length > 0) {
      return exactIdMatches
    }

    return providerMatches.filter(({ model }) => normalizeLookupToken(model.label) === normalizedModel)
  }

  private hasProviderMatch(query: string, models: TelegramModelListItem[]): boolean {
    return models.some((item) => this.matchesProviderToken(query, item))
  }

  private matchesProviderToken(query: string, item: TelegramModelListItem): boolean {
    const normalizedQuery = normalizeProviderToken(query)
    const candidates = [
      item.account.providerId,
      item.provider?.id,
      item.provider?.displayName,
      item.account.id,
      item.account.label
    ].filter((value): value is string => Boolean(value))

    return candidates.some((candidate) => normalizeProviderToken(candidate) === normalizedQuery)
  }

  private findModelByRef(modelRef: ModelRef, models: TelegramModelListItem[]): TelegramModelListItem | undefined {
    return models.find((item) =>
      item.account.id === modelRef.accountId && item.model.id === modelRef.modelId
    )
  }

  private resolveModelLabel(modelRef: ModelRef): string | undefined {
    const config = this.appConfigStore.requireConfig()
    const context = this.modelResolver.resolve(config, modelRef)
    return context ? `${context.model.label} [${context.model.type}]` : undefined
  }

  private buildProviderCommandToken(item: TelegramModelListItem): string {
    return item.provider?.id ?? item.account.providerId
  }

  private buildModelSwitchCommand(item: TelegramModelListItem): string {
    return `/model ${this.buildProviderCommandToken(item)} ${item.model.id}`
  }

  private describeProviderForPlainText(item: TelegramModelListItem): string {
    const providerId = this.buildProviderCommandToken(item)
    const providerLabel = item.provider?.displayName
    return providerLabel && providerLabel !== providerId
      ? `${providerId} (${providerLabel})`
      : providerId
  }

  private describeModelForPlainText(item: TelegramModelListItem): string {
    return `${item.model.label} [${item.model.id}] · ${this.describeProviderForPlainText(item)} · ${item.account.label}`
  }

  private buildPagerKeyboard(
    kind: 'models' | 'tools',
    page: number,
    totalPages: number
  ): Array<Array<{ text: string; callbackData: string }>> | undefined {
    if (totalPages <= 1) {
      return undefined
    }

    const row: Array<{ text: string; callbackData: string }> = []
    if (page > 0) {
      row.push({ text: 'Prev', callbackData: `tgcmd:${kind}:${page - 1}` })
    }
    if (page < totalPages - 1) {
      row.push({ text: 'Next', callbackData: `tgcmd:${kind}:${page + 1}` })
    }

    return row.length > 0 ? [row] : undefined
  }
}
