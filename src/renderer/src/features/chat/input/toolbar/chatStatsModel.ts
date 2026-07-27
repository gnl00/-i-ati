export type ChatStatsStatus =
  | 'enabled'
  | 'compacting'
  | 'disabled'
  | 'context-unavailable'

type ChatStatsMessage = Pick<MessageEntity, 'id' | 'tokens' | 'body'>

export type ChatStatsModel = {
  status: ChatStatsStatus
  totalConversationTokens: number
  accumulatedTokens: number
  contextWindowTokens?: number
  thresholdTokens?: number
  triggerTokenRatio: number
  progressToCompact?: number
  toolCallCount: number
  toolResultCount: number
}

type BuildChatStatsModelInput = {
  messages: ChatStatsMessage[]
  activeCompressedMessageIds: ReadonlySet<number>
  contextWindowTokens?: number
  triggerTokenRatio?: number
  autoCompactEnabled: boolean
  compressionPending: boolean
}

const DEFAULT_TRIGGER_TOKEN_RATIO = 0.7

function positiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

function resolveTriggerTokenRatio(value: unknown): number {
  const ratio = positiveFiniteNumber(value)
  return ratio ? Math.min(ratio, 1) : DEFAULT_TRIGGER_TOKEN_RATIO
}

function resolveContextWindowTokens(value: unknown): number | undefined {
  const tokens = positiveFiniteNumber(value)
  if (!tokens) {
    return undefined
  }

  const flooredTokens = Math.floor(tokens)
  return flooredTokens > 0 ? flooredTokens : undefined
}

export function buildChatStatsModel({
  messages,
  activeCompressedMessageIds,
  contextWindowTokens,
  triggerTokenRatio,
  autoCompactEnabled,
  compressionPending
}: BuildChatStatsModelInput): ChatStatsModel {
  const normalizedContextWindowTokens = resolveContextWindowTokens(contextWindowTokens)
  const normalizedTriggerTokenRatio = resolveTriggerTokenRatio(triggerTokenRatio)

  let totalConversationTokens = 0
  let accumulatedTokens = 0
  let toolCallCount = 0
  let toolResultCount = 0

  messages.forEach(message => {
    const tokens = positiveFiniteNumber(message.tokens) ?? 0
    totalConversationTokens += tokens

    if (message.id && !activeCompressedMessageIds.has(message.id)) {
      accumulatedTokens += tokens
    }

    if (message.body.role === 'tool') {
      toolResultCount += 1
    }
    toolCallCount += (message.body.segments ?? [])
      .filter(segment => segment.type === 'toolCall')
      .length
  })

  const thresholdTokens = normalizedContextWindowTokens
    ? Math.ceil(normalizedContextWindowTokens * normalizedTriggerTokenRatio)
    : undefined
  const progressToCompact = thresholdTokens
    ? Math.min(accumulatedTokens / thresholdTokens, 1)
    : undefined

  let status: ChatStatsStatus = 'enabled'
  if (!autoCompactEnabled) {
    status = 'disabled'
  } else if (!normalizedContextWindowTokens) {
    status = 'context-unavailable'
  } else if (compressionPending) {
    status = 'compacting'
  }

  return {
    status,
    totalConversationTokens,
    accumulatedTokens,
    contextWindowTokens: normalizedContextWindowTokens,
    thresholdTokens,
    triggerTokenRatio: normalizedTriggerTokenRatio,
    progressToCompact,
    toolCallCount,
    toolResultCount
  }
}

export function formatCompactTokenCount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

export function formatProgressPercent(progress: number | undefined): string {
  if (progress === undefined) {
    return '—'
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1
  }).format(progress * 100)}%`
}
