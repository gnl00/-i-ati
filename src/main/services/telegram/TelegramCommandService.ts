import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import { ChatModelContextResolver } from '@main/hosts/chat/config/ChatModelContextResolver'
import { TelegramAgentAdapter, type TelegramInboundEnvelope } from '@main/hosts/telegram'
import { HostChatBindingService } from '@main/hosts/shared/HostChatBindingService'
import DatabaseService from '@main/db/DatabaseService'
import { embeddedToolsRegistry } from '@tools/registry'
import { getDefaultWorkspacePath } from '@shared/workspace/workspacePaths'
import type { TelegramCommand, TelegramCommandCallback } from './telegram-command-parser'

const MAX_MESSAGE_LENGTH = 3500
const MODELS_PAGE_SIZE = 5
const TOOLS_PAGE_SIZE = 12

const truncateMessage = (value: string, limit = MAX_MESSAGE_LENGTH): string =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value

const isEnabledModel = (model: AccountModel): boolean => model.enabled !== false
const isSameModelRef = (left?: ModelRef, right?: ModelRef): boolean =>
  Boolean(left && right && left.accountId === right.accountId && left.modelId === right.modelId)
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export type TelegramCommandResponse = {
  text: string
  parseMode?: 'HTML'
  inlineKeyboard?: Array<Array<{ text: string; callbackData: string }>>
}

export class TelegramCommandService {
  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly modelResolver = new ChatModelContextResolver(),
    private readonly adapter = new TelegramAgentAdapter(),
    private readonly hostChatBindingService = new HostChatBindingService()
  ) {}

  async execute(command: TelegramCommand, envelope: TelegramInboundEnvelope, defaultModelRef: ModelRef): Promise<TelegramCommandResponse> {
    switch (command.name) {
      case 'newchat':
        return await this.handleNewChat(envelope, defaultModelRef)
      case 'models':
        return await this.handleModels(envelope, defaultModelRef, 0)
      case 'model':
        return await this.handleModel(command.args, envelope, defaultModelRef)
      case 'tools':
        return this.handleTools(0)
      case 'workspace':
        return await this.handleWorkspace(command.args, envelope, defaultModelRef)
      case 'status':
        return await this.handleStatus(envelope, defaultModelRef)
      case 'help':
        return this.handleHelp()
      default:
        return this.handleHelp()
    }
  }

  async executeCallback(
    callback: TelegramCommandCallback,
    envelope: TelegramInboundEnvelope,
    defaultModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    switch (callback.type) {
      case 'models':
        return await this.handleModels(envelope, defaultModelRef, callback.page)
      case 'tools':
        return this.handleTools(callback.page)
      default:
        return this.handleHelp()
    }
  }

  private async handleNewChat(envelope: TelegramInboundEnvelope, defaultModelRef: ModelRef): Promise<TelegramCommandResponse> {
    const created = await this.hostChatBindingService.createAndBind({
      hostType: 'telegram',
      hostChatId: envelope.chatId,
      hostThreadId: envelope.threadId,
      hostUserId: envelope.fromUserId,
      title: this.buildInitialChatTitle(envelope),
      modelRef: defaultModelRef,
      metadata: {
        chatType: envelope.chatType,
        username: envelope.username,
        displayName: envelope.displayName
      }
    })

    const modelLabel = this.resolveModelLabel(defaultModelRef) ?? defaultModelRef.modelId

    return { text: [
      'Started a new chat.',
      `Chat: ${created.chat.uuid}`,
      `Model: ${modelLabel}`
    ].join('\n') }
  }

  private async handleModels(
    envelope: TelegramInboundEnvelope,
    defaultModelRef: ModelRef,
    page: number
  ): Promise<TelegramCommandResponse> {
    const { chat } = await this.adapter.resolveOrCreateSession(envelope, defaultModelRef)
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
        `${escapeHtml(providerLabel)} · ${escapeHtml(item.account.label)}`
      ].join('\n')
    })

    return {
      text: truncateMessage([
        `<b>Available models</b>`,
        `Page ${safePage + 1}/${totalPages}`,
        '',
        ...lines.flatMap((line) => [line, '']),
        'Use <pre>/model &lt;model id&gt;</pre> to switch models.'
      ].join('\n').trim()),
      parseMode: 'HTML',
      inlineKeyboard: this.buildPagerKeyboard('models', safePage, totalPages)
    }
  }

  private async handleModel(
    args: string,
    envelope: TelegramInboundEnvelope,
    defaultModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    const { chat } = await this.adapter.resolveOrCreateSession(envelope, defaultModelRef)

    if (!args.trim()) {
      const currentLabel = chat.modelRef
        ? (this.resolveModelLabel(chat.modelRef) ?? chat.modelRef.modelId)
        : 'not set'
      return { text: [
        `Current model: ${currentLabel}`,
        'Usage: /model <model id or model label>'
      ].join('\n') }
    }

    const models = this.getAvailableModels()
    const matches = this.findMatchingModels(args, models)

    if (matches.length === 0) {
      return { text: `No model matched "${args}". Use /models to list available models.` }
    }

    if (matches.length > 1) {
      return { text: truncateMessage([
        `Multiple models matched "${args}":`,
        ...matches.map((item) => `- ${item.model.label} · id=${item.model.id} · ${item.account.label}`),
        'Please use a more specific model id or label.'
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
      `Account: ${match.account.label}`
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
    defaultModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    const parts = args.trim().split(/\s+/)
    const subcommand = parts[0]?.toLowerCase()
    const subArgs = parts.slice(1).join(' ').trim()

    switch (subcommand) {
      case 'get':
        return await this.handleWorkspaceGet(envelope, defaultModelRef)
      case 'set':
        return await this.handleWorkspaceSet(subArgs, envelope, defaultModelRef)
      case 'clear':
        return await this.handleWorkspaceClear(envelope, defaultModelRef)
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
    defaultModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    const { chat } = await this.adapter.resolveOrCreateSession(envelope, defaultModelRef)
    const workspacePath = chat.workspacePath ?? getDefaultWorkspacePath(chat.uuid)
    return { text: `Current workspace: ${workspacePath}` }
  }

  private async handleWorkspaceSet(
    inputPath: string,
    envelope: TelegramInboundEnvelope,
    defaultModelRef: ModelRef
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

    const { chat } = await this.adapter.resolveOrCreateSession(envelope, defaultModelRef)
    DatabaseService.updateChat({ ...chat, workspacePath: inputPath, updateTime: Date.now() })

    return { text: `Workspace updated.\nPath: ${inputPath}` }
  }

  private async handleWorkspaceClear(
    envelope: TelegramInboundEnvelope,
    defaultModelRef: ModelRef
  ): Promise<TelegramCommandResponse> {
    const { chat } = await this.adapter.resolveOrCreateSession(envelope, defaultModelRef)
    const defaultPath = getDefaultWorkspacePath(chat.uuid)
    DatabaseService.updateChat({ ...chat, workspacePath: defaultPath, updateTime: Date.now() })
    return { text: `Workspace reset to default.\nPath: ${defaultPath}` }
  }

  private async handleStatus(envelope: TelegramInboundEnvelope, defaultModelRef: ModelRef): Promise<TelegramCommandResponse> {
    const { chat, binding } = await this.adapter.resolveOrCreateSession(envelope, defaultModelRef)
    const modelLabel = chat.modelRef
      ? (this.resolveModelLabel(chat.modelRef) ?? chat.modelRef.modelId)
      : 'not set'

    return { text: [
      'Telegram chat status',
      `Chat UUID: ${chat.uuid}`,
      `Title: ${chat.title}`,
      `Model: ${modelLabel}`,
      `Binding: ${binding.hostType}:${binding.hostChatId}${binding.hostThreadId ? `:${binding.hostThreadId}` : ''}`
    ].join('\n') }
  }

  private handleHelp(): TelegramCommandResponse {
    return { text: [
      'Available commands:',
      '/newchat - Start a new chat with the default model',
      '/models - List all available models',
      '/model <name> - Set the current chat model',
      '/tools - List available tools',
      '/workspace get|set|clear - Manage the current workspace',
      '/status - Show current chat and model status',
      '/help - Show bot commands and usage'
    ].join('\n') }
  }

  private getAvailableModels(): Array<{ account: ProviderAccount; model: AccountModel; provider?: ProviderDefinition }> {
    const config = this.appConfigStore.requireConfig()
    const result: Array<{ account: ProviderAccount; model: AccountModel; provider?: ProviderDefinition }> = []

    for (const account of config.accounts ?? []) {
      const provider = config.providerDefinitions?.find((item) => item.id === account.providerId)
      for (const model of account.models ?? []) {
        if (isEnabledModel(model)) {
          result.push({ account, model, provider })
        }
      }
    }

    return result
  }

  private findMatchingModels(
    query: string,
    models: Array<{ account: ProviderAccount; model: AccountModel; provider?: ProviderDefinition }>
  ): Array<{ account: ProviderAccount; model: AccountModel; provider?: ProviderDefinition }> {
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

  private resolveModelLabel(modelRef: ModelRef): string | undefined {
    const config = this.appConfigStore.requireConfig()
    const context = this.modelResolver.resolve(config, modelRef)
    return context ? `${context.model.label} [${context.model.type}]` : undefined
  }

  private buildInitialChatTitle(envelope: TelegramInboundEnvelope): string {
    if (envelope.chatType === 'private') {
      return envelope.displayName || envelope.username || 'Telegram Chat'
    }
    return envelope.displayName || envelope.username || 'Telegram Group'
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
