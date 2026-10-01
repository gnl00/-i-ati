import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { configDb } from '@main/db/config'
import { chatDb } from '@main/db/chat'
import { telegramGatewayService } from '@main/services/telegram'
import type {
  TelegramGatewayToolArgs,
  TelegramGatewayToolResponse,
  TelegramSearchTargetItem,
  TelegramSearchTargetsArgs,
  TelegramSearchTargetsResponse,
  TelegramSendMessageArgs,
  TelegramSendMessageResponse,
  TelegramSetupToolArgs,
  TelegramSetupToolResponse
} from '@tools/telegram/index.d'

const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 20
const MAX_TELEGRAM_MESSAGE_LENGTH = 3500

type TelegramBindingMetadata = {
  chatType?: 'private' | 'group' | 'supergroup' | 'channel'
  username?: string
  displayName?: string
}

type ResolvedTelegramTarget = TelegramSearchTargetItem & {
  chatId?: number
}

const normalizeText = (value?: string): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const clampSearchLimit = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_SEARCH_LIMIT
  }

  return Math.min(Math.max(Math.floor(value as number), 1), MAX_SEARCH_LIMIT)
}

const normalizeTelegramChatType = (
  value?: string
): TelegramSearchTargetItem['chatType'] => {
  if (value === 'private' || value === 'group' || value === 'supergroup' || value === 'channel') {
    return value
  }
  return 'private'
}

const normalizeTelegramSearchQuery = (value?: string): string | undefined => {
  return normalizeText(value)?.toLowerCase()
}

const collectTelegramTargets = (args?: {
  currentChatUuid?: string
  includeArchived?: boolean
}): ResolvedTelegramTarget[] => {
  const chats = chatDb.getAllChats()
  const items: ResolvedTelegramTarget[] = []

  for (const chat of chats) {
    const bindings = chatDb.getChatHostBindingsByChatUuid(chat.uuid)

    for (const binding of bindings) {
      if (binding.hostType !== 'telegram') {
        continue
      }

      if (!args?.includeArchived && binding.status !== 'active') {
        continue
      }

      const metadata = (binding.metadata || {}) as TelegramBindingMetadata
      items.push({
        targetChatUuid: chat.uuid,
        chatId: chat.id,
        chatTitle: chat.title,
        telegramChatId: binding.hostChatId,
        telegramThreadId: binding.hostThreadId,
        telegramUserId: binding.hostUserId,
        username: normalizeText(metadata.username),
        displayName: normalizeText(metadata.displayName),
        chatType: normalizeTelegramChatType(metadata.chatType),
        status: binding.status,
        lastActiveAt: Math.max(chat.updateTime ?? 0, binding.updateTime ?? 0),
        matchReasons: []
      })
    }
  }

  return items.sort((left, right) => {
    const currentScore = Number(right.targetChatUuid === args?.currentChatUuid) - Number(left.targetChatUuid === args?.currentChatUuid)
    if (currentScore !== 0) {
      return currentScore
    }
    return right.lastActiveAt - left.lastActiveAt
  })
}

const scoreTelegramTarget = (
  target: ResolvedTelegramTarget,
  normalizedQuery?: string
): { matched: boolean; matchReasons: TelegramSearchTargetItem['matchReasons']; score: number } => {
  if (!normalizedQuery) {
    return {
      matched: true,
      matchReasons: [],
      score: 0
    }
  }

  const candidates: Array<{
    reason: TelegramSearchTargetItem['matchReasons'][number]
    value?: string
    exactScore: number
    prefixScore: number
    containsScore: number
  }> = [
    { reason: 'chat_id', value: target.telegramChatId, exactScore: 120, prefixScore: 90, containsScore: 70 },
    { reason: 'user_id', value: target.telegramUserId, exactScore: 110, prefixScore: 85, containsScore: 65 },
    { reason: 'username', value: target.username, exactScore: 100, prefixScore: 80, containsScore: 60 },
    { reason: 'display_name', value: target.displayName, exactScore: 90, prefixScore: 75, containsScore: 55 },
    { reason: 'title', value: target.chatTitle, exactScore: 80, prefixScore: 70, containsScore: 50 }
  ]

  const matchReasons: TelegramSearchTargetItem['matchReasons'] = []
  let score = 0

  for (const candidate of candidates) {
    const normalizedValue = candidate.value?.trim().toLowerCase()
    if (!normalizedValue) {
      continue
    }

    if (normalizedValue === normalizedQuery) {
      matchReasons.push(candidate.reason)
      score = Math.max(score, candidate.exactScore)
      continue
    }

    if (normalizedValue.startsWith(normalizedQuery)) {
      matchReasons.push(candidate.reason)
      score = Math.max(score, candidate.prefixScore)
      continue
    }

    if (normalizedValue.includes(normalizedQuery)) {
      matchReasons.push(candidate.reason)
      score = Math.max(score, candidate.containsScore)
    }
  }

  return {
    matched: matchReasons.length > 0,
    matchReasons,
    score
  }
}

const findTelegramBindingTarget = (
  targetChatUuid: string,
  includeArchived = false
): ResolvedTelegramTarget | undefined => {
  const chat = chatDb.getChatByUuid(targetChatUuid)
  if (!chat) {
    return undefined
  }

  const binding = chatDb.getChatHostBindingsByChatUuid(targetChatUuid)
    .find((item) => item.hostType === 'telegram' && (includeArchived || item.status === 'active'))

  if (!binding) {
    return undefined
  }

  const metadata = (binding.metadata || {}) as TelegramBindingMetadata
  return {
    targetChatUuid: chat.uuid,
    chatId: chat.id,
    chatTitle: chat.title,
    telegramChatId: binding.hostChatId,
    telegramThreadId: binding.hostThreadId,
    telegramUserId: binding.hostUserId,
    username: normalizeText(metadata.username),
    displayName: normalizeText(metadata.displayName),
    chatType: normalizeTelegramChatType(metadata.chatType),
    status: binding.status,
    lastActiveAt: Math.max(chat.updateTime ?? 0, binding.updateTime ?? 0),
    matchReasons: []
  }
}

const findTelegramTargetByChatTuple = (
  chatId: string,
  threadId?: string,
  includeArchived = false
): ResolvedTelegramTarget | undefined => {
  return collectTelegramTargets({ includeArchived }).find((item) =>
    item.telegramChatId === chatId
    && (item.telegramThreadId ?? undefined) === (threadId ?? undefined)
  )
}

const persistTelegramOutboundMessage = (args: {
  target: ResolvedTelegramTarget
  source: ChatEntity
  association: ChatTelegramTargetEntity
  text: string
  sentMessageId?: string
  replyToMessageId?: string
}): number => {
  // Reload after the network wait so concurrent messages are preserved.
  const chat = chatDb.getChatByUuid(args.source.uuid)
  if (!chat?.id) {
    throw new Error('Source chat no longer exists.')
  }

  const createdAt = Date.now()
  const messageId = chatDb.saveMessage({
    chatId: chat.id,
    chatUuid: chat.uuid,
    body: {
      createdAt,
      role: 'assistant',
      content: args.text,
      segments: [],
      typewriterCompleted: true,
      source: MESSAGE_SOURCE.TELEGRAM_DELIVERY,
      host: {
        type: 'telegram',
        direction: 'outbound',
        peerId: args.target.telegramChatId,
        peerType: args.target.chatType,
        threadId: args.target.telegramThreadId,
        messageId: args.sentMessageId,
        replyToMessageId: args.replyToMessageId,
        userId: args.target.telegramUserId,
        username: args.target.username,
        displayName: args.target.displayName
      }
    }
  })

  if (args.sentMessageId) {
    chatDb.saveTelegramReceipt(args.association, args.sentMessageId, messageId)
  }
  chatDb.updateChat({
    ...chat,
    messages: [...(chat.messages || []), messageId],
    updateTime: createdAt
  })
  return messageId
}

const findSavedTelegramTarget = (chatUuid: string, botId: string): ResolvedTelegramTarget | undefined => {
  const saved = chatDb.getTelegramTarget(chatUuid, botId)
  if (!saved) return undefined
  const metadata = (saved.metadata || {}) as TelegramBindingMetadata
  const known = findTelegramTargetByChatTuple(saved.hostChatId, saved.hostThreadId, true)
  return {
    targetChatUuid: chatUuid,
    chatTitle: chatDb.getChatByUuid(chatUuid)?.title || 'NewChat',
    telegramChatId: saved.hostChatId,
    telegramThreadId: saved.hostThreadId,
    telegramUserId: saved.hostUserId,
    chatType: normalizeTelegramChatType(metadata.chatType),
    username: metadata.username,
    displayName: metadata.displayName,
    status: known?.status ?? 'active',
    lastActiveAt: known?.lastActiveAt ?? 0,
    matchReasons: []
  }
}

const uniqueTelegramTargets = (): ResolvedTelegramTarget[] => {
  const targets = new Map<string, ResolvedTelegramTarget>()
  for (const target of collectTelegramTargets()) {
    const key = JSON.stringify([target.telegramChatId, target.telegramThreadId ?? null])
    if (!targets.has(key)) targets.set(key, target)
  }
  return [...targets.values()]
}

const resolveTelegramSendTarget = (args: TelegramSendMessageArgs, botId: string): ResolvedTelegramTarget | undefined => {
  const explicitTargetChatUuid = normalizeText(args.target_chat_uuid)
  if (explicitTargetChatUuid) {
    return findSavedTelegramTarget(explicitTargetChatUuid, botId)
      ?? findTelegramBindingTarget(explicitTargetChatUuid, true)
  }

  const explicitChatId = normalizeText(args.chat_id)
  if (explicitChatId) {
    const explicitThreadId = normalizeText(args.thread_id)
    return findTelegramTargetByChatTuple(explicitChatId, explicitThreadId, true) ?? {
      targetChatUuid: '',
      chatTitle: explicitThreadId ? `Telegram ${explicitChatId} / thread ${explicitThreadId}` : `Telegram ${explicitChatId}`,
      telegramChatId: explicitChatId,
      telegramThreadId: explicitThreadId,
      chatType: 'private',
      status: 'active',
      lastActiveAt: Date.now(),
      matchReasons: []
    }
  }

  const currentChatUuid = normalizeText(args.chat_uuid)
  if (currentChatUuid) {
    const target = findSavedTelegramTarget(currentChatUuid, botId)
      ?? findTelegramBindingTarget(currentChatUuid, true)
    if (target) return target
  }
  const candidates = uniqueTelegramTargets()
  return candidates.length === 1 ? candidates[0] : undefined
}

const buildNextTelegramConfig = (
  config: IAppConfig,
  botToken: string,
  botProfile?: {
    botUsername?: string
    botId?: string
  }
): IAppConfig => {
  const {
    providerDefinitions: _providerDefinitions,
    accounts: _accounts,
    ...baseConfig
  } = config

  return {
    ...baseConfig,
    telegram: {
      ...config.telegram,
      enabled: true,
      botToken,
      botUsername: botProfile?.botUsername,
      botId: botProfile?.botId,
      mode: config.telegram?.mode ?? 'polling'
    }
  }
}

export async function processTelegramSetupTool(
  args: TelegramSetupToolArgs
): Promise<TelegramSetupToolResponse> {
  const botToken = args.bot_token?.trim()
  if (!botToken) {
    return {
      success: false,
      configured: false,
      running: false,
      starting: false,
      message: 'bot_token is required.'
    }
  }

  try {
    const baseConfig = configDb.getConfig() ?? configDb.initConfig()
    await telegramGatewayService.startWithToken(botToken)
    const status = telegramGatewayService.getStatus()

    try {
      configDb.saveConfig(buildNextTelegramConfig(baseConfig, botToken, {
        botUsername: status.botUsername,
        botId: status.botId
      }))
    } catch (saveError) {
      telegramGatewayService.stop()
      throw saveError
    }

    return {
      success: true,
      configured: true,
      running: status.running,
      starting: status.starting,
      botUsername: status.botUsername,
      botId: status.botId,
      message: status.botUsername
        ? `Telegram gateway started as @${status.botUsername} and configuration was saved.`
        : 'Telegram gateway started and configuration was saved.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = telegramGatewayService.getStatus()
    return {
      success: false,
      configured: Boolean(status.configured),
      running: status.running,
      starting: status.starting,
      botUsername: status.botUsername,
      botId: status.botId,
      message: `Failed to set up Telegram gateway: ${message}`
    }
  }
}

export async function processTelegramSearchTargets(
  args: TelegramSearchTargetsArgs
): Promise<TelegramSearchTargetsResponse> {
  try {
    const status = telegramGatewayService.getStatus()
    const currentChatUuid = normalizeText(args.chat_uuid)
    const normalizedQuery = normalizeTelegramSearchQuery(args.query)
    const limit = clampSearchLimit(args.limit)
    const includeArchived = Boolean(args.include_archived)

    const rankedTargets = collectTelegramTargets({
      currentChatUuid,
      includeArchived
    })
      .map((item) => {
        const match = scoreTelegramTarget(item, normalizedQuery)
        return {
          item: {
            ...item,
            matchReasons: match.matchReasons
          },
          matched: match.matched,
          score: match.score
        }
      })
      .filter((entry) => entry.matched)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score
        }
        const currentScore = Number(right.item.targetChatUuid === currentChatUuid) - Number(left.item.targetChatUuid === currentChatUuid)
        if (currentScore !== 0) {
          return currentScore
        }
        return right.item.lastActiveAt - left.item.lastActiveAt
      })
      .slice(0, limit)
    const items: TelegramSearchTargetItem[] = rankedTargets.map(({ item }) => ({
      targetChatUuid: item.targetChatUuid,
      chatTitle: item.chatTitle,
      telegramChatId: item.telegramChatId,
      telegramThreadId: item.telegramThreadId,
      telegramUserId: item.telegramUserId,
      username: item.username,
      displayName: item.displayName,
      chatType: item.chatType,
      status: item.status,
      lastActiveAt: item.lastActiveAt,
      matchReasons: item.matchReasons
    }))

    return {
      success: true,
      count: items.length,
      running: status.running,
      botUsername: status.botUsername,
      botId: status.botId,
      items,
      message: items.length > 0
        ? `Found ${items.length} Telegram target${items.length > 1 ? 's' : ''}.`
        : 'No Telegram targets found.'
    }
  } catch (error) {
    const status = telegramGatewayService.getStatus()
    return {
      success: false,
      count: 0,
      running: status.running,
      botUsername: status.botUsername,
      botId: status.botId,
      items: [],
      message: `Failed to search Telegram targets: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function processTelegramSendMessage(
  args: TelegramSendMessageArgs
): Promise<TelegramSendMessageResponse> {
  const text = normalizeText(args.text)
  if (!text) {
    return {
      success: false,
      message: 'text is required.'
    }
  }

  if (text.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
    return {
      success: false,
      message: `text must be at most ${MAX_TELEGRAM_MESSAGE_LENGTH} characters.`
    }
  }

  const sourceChatUuid = normalizeText(args.chat_uuid)
  const source = sourceChatUuid ? chatDb.getChatByUuid(sourceChatUuid) : undefined
  if (!source?.id) {
    return { success: false, message: 'A persisted current chat is required to send a Telegram message.' }
  }

  const status = telegramGatewayService.getStatus()
  if (!status.running || !status.botId) {
    return {
      success: false,
      botUsername: status.botUsername,
      botId: status.botId,
      message: 'Telegram gateway is not running or its bot identity is unavailable.'
    }
  }

  const target = resolveTelegramSendTarget(args, status.botId)
  if (!target) {
    const hasExplicitTarget = Boolean(normalizeText(args.target_chat_uuid) || normalizeText(args.chat_id))
    const candidates = hasExplicitTarget ? [] : uniqueTelegramTargets()
    return {
      success: false,
      candidates,
      message: hasExplicitTarget
        ? 'The selected Telegram target could not be resolved.'
        : candidates.length > 1
          ? 'Multiple Telegram recipients are available. Ask the user to select a recipient, then retry with target_chat_uuid or chat_id. Nothing was sent or associated.'
          : 'No Telegram recipient is available. Provide an explicit chat_id or establish a Telegram session first.'
    }
  }
  if (target.status !== 'active') {
    return { success: false, message: 'Telegram target is archived.' }
  }

  const association: ChatTelegramTargetEntity = {
    chatId: source.id,
    chatUuid: source.uuid,
    botId: status.botId,
    hostChatId: target.telegramChatId,
    hostThreadId: target.telegramThreadId,
    hostUserId: target.telegramUserId,
    metadata: { chatType: target.chatType, username: target.username, displayName: target.displayName }
  }
  const replyToMessageId = normalizeText(args.reply_to_message_id)
  let sentMessageId: string | undefined
  try {
    // Associate before sending, without changing the inbound binding.
    chatDb.saveTelegramTarget(association)
    const result = await telegramGatewayService.sendText({
      chatId: target.telegramChatId,
      text,
      threadId: target.telegramThreadId,
      replyToMessageId
    })
    sentMessageId = result.messageId
  } catch (error) {
    return {
      success: false,
      sourceChatUuid: source.uuid,
      targetChatUuid: target.targetChatUuid || undefined,
      chatId: target.telegramChatId,
      threadId: target.telegramThreadId,
      botUsername: status.botUsername,
      botId: status.botId,
      message: `Failed to send Telegram message: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  let deliveryMessageId: number | undefined
  let deliveryRecorded = true
  try {
    deliveryMessageId = persistTelegramOutboundMessage({ target, source, association, text, sentMessageId, replyToMessageId })
  } catch {
    deliveryRecorded = false
  }
  return {
    success: true,
    sentMessageId,
    sourceChatUuid: source.uuid,
    targetChatUuid: target.targetChatUuid || undefined,
    chatId: target.telegramChatId,
    threadId: target.telegramThreadId,
    botUsername: status.botUsername,
    botId: status.botId,
    deliveryRecorded,
    deliveryMessageId,
    message: deliveryRecorded
      ? `Telegram message sent from "${source.title}".`
      : 'Telegram message was sent, but its local delivery record could not be completed. Do not resend; reply routing may be unavailable.'
  }
}

export async function processTelegramGateway(
  args: TelegramGatewayToolArgs
): Promise<TelegramGatewayToolResponse> {
  const action = args?.action
  if (action !== 'start' && action !== 'stop' && action !== 'status') {
    return { success: false, action: String(action ?? ''), message: 'action must be start, stop, or status.' }
  }

  try {
    if (action === 'start') await telegramGatewayService.start()
    if (action === 'stop') telegramGatewayService.stop()
    const status = telegramGatewayService.getStatus()
    if (action === 'start' && !status.running && !status.starting) {
      return {
        success: false, action, status,
        message: !status.configured ? 'Configure Telegram with telegram_setup_tool first.'
          : !status.enabled ? 'Enable Telegram in Settings first.'
            : !status.hasMainModel ? 'Configure an available main model first.'
              : 'Telegram gateway did not start. Check status.lastError.'
      }
    }
    return {
      success: true, action, status,
      message: action === 'status' ? 'Telegram gateway status retrieved.'
        : action === 'stop' ? 'Telegram gateway stopped.'
          : status.running ? 'Telegram gateway is running.' : 'Telegram gateway startup queued. Use status to check progress.'
    }
  } catch (error) {
    return {
      success: false, action,
      message: `Telegram gateway ${action} failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
