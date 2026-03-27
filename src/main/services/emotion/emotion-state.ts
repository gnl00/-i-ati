import {
  clampEmotionIntensity,
  normalizeEmotionLabel,
  pickEmotionEmoji,
  scoreToEmotionIntensity
} from '@shared/emotion/emotionAssetCatalog'

const EMOTION_TOOL_NAME = 'emotion_report'
const DEFAULT_BACKGROUND_DRIFT_FACTOR = 0.1
const DEFAULT_BACKGROUND_INTENSITY = 5
const DEFAULT_HISTORY_LIMIT = 10
const DEFAULT_ACCUMULATED_DECAY = 0.95

function isEmotionToolName(name: string | undefined): boolean {
  return name === EMOTION_TOOL_NAME
}

type ExtractedEmotionToolState = {
  emotion: ChatEmotionState
  accumulated?: EmotionStateSnapshot['accumulated']
}

export function extractEmotionFromToolSegments(message: ChatMessage): ChatEmotionState | undefined {
  return extractEmotionToolStateFromSegments(message)?.emotion
}

export function hasVisibleAssistantText(content: string | VLMContent[] | undefined): content is string {
  return typeof content === 'string' && content.trim().length > 0
}

export function extractEmotionToolStateFromSegments(message: ChatMessage): ExtractedEmotionToolState | undefined {
  const segments = Array.isArray(message.segments) ? message.segments : []

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]
    if (segment.type !== 'toolCall') continue

    const toolName = typeof segment.content?.toolName === 'string'
      ? segment.content.toolName
      : segment.name

    if (!isEmotionToolName(toolName) || segment.isError) {
      continue
    }

    const result = segment.content?.result as {
      success?: boolean
      label?: string
      stateText?: string
      intensity?: number
      reason?: string
      emoji?: string
      accumulated?: Array<{
        label?: string
        description?: string
        intensity?: number
        decay?: number
      }>
    } | undefined

    if (result?.success === false) {
      continue
    }

    const label = normalizeEmotionLabel(result?.label) || result?.label?.trim()
    const stateText = result?.stateText?.trim()
    const resolvedIntensity = typeof result?.intensity === 'number'
      ? clampEmotionIntensity(result.intensity)
      : undefined
    const emoji = result?.emoji?.trim() || pickEmotionEmoji(label, resolvedIntensity)

    if (!label || !emoji) {
      continue
    }

    const accumulated = normalizeAccumulatedEntries(result?.accumulated)

    return {
      emotion: {
        label,
        emoji,
        ...(stateText ? { stateText } : {}),
        ...(typeof resolvedIntensity === 'number' ? { intensity: resolvedIntensity } : {}),
        ...(result?.reason ? { reason: result.reason } : {}),
        source: 'tool'
      },
      ...(accumulated ? { accumulated } : {})
    }
  }

  return undefined
}

export function buildFallbackEmotionState(
  label: string | undefined,
  score?: number
): ChatEmotionState {
  const intensity = scoreToEmotionIntensity(score)

  return {
    label: normalizeEmotionLabel(label) || 'neutral',
    emoji: pickEmotionEmoji(label, intensity),
    intensity,
    ...(typeof score === 'number' ? { score } : {}),
    source: 'fallback'
  }
}

export function deriveEmotionIntensity(emotion: ChatEmotionState): number {
  if (typeof emotion.intensity === 'number' && Number.isFinite(emotion.intensity)) {
    return clampEmotionIntensity(Math.round(emotion.intensity))
  }

  if (typeof emotion.score === 'number' && Number.isFinite(emotion.score)) {
    return scoreToEmotionIntensity(emotion.score)
  }

  return DEFAULT_BACKGROUND_INTENSITY
}

export function buildNextEmotionStateSnapshot(
  previous: EmotionStateSnapshot | undefined,
  emotion: ChatEmotionState,
  options: {
    now?: number
    accumulated?: EmotionStateSnapshot['accumulated']
  } = {}
): EmotionStateSnapshot {
  const now = options.now ?? Date.now()
  const intensity = deriveEmotionIntensity(emotion)
  const current: EmotionStateEntry = {
    label: emotion.label,
    intensity,
    updatedAt: now
  }

  const previousBackground = previous?.background
  const background = previousBackground
    ? buildNextBackgroundState(previousBackground, current, now)
    : {
      label: current.label,
      intensity: clampBackgroundIntensity(current.intensity),
      driftFactor: DEFAULT_BACKGROUND_DRIFT_FACTOR,
      updatedAt: now
    }

  const accumulated = normalizePersistedAccumulatedEntries(
    options.accumulated ?? decayAccumulatedEntries(previous?.accumulated, now),
    now
  )

  const nextHistoryEntry: EmotionStateHistoryEntry = {
    label: current.label,
    intensity: current.intensity,
    timestamp: now,
    source: emotion.source
  }

  const history = [...(previous?.history || []), nextHistoryEntry]
    .slice(-DEFAULT_HISTORY_LIMIT)

  return {
    current,
    background,
    accumulated,
    history
  }
}

function buildNextBackgroundState(
  previous: EmotionStateSnapshot['background'],
  current: EmotionStateEntry,
  now: number
): EmotionStateSnapshot['background'] {
  if (previous.label !== current.label) {
    return {
      ...previous,
      updatedAt: now
    }
  }

  const direction = current.intensity === previous.intensity
    ? 0
    : current.intensity > previous.intensity ? 1 : -1

  return {
    ...previous,
    intensity: clampBackgroundIntensity(previous.intensity + (direction * previous.driftFactor)),
    updatedAt: now
  }
}

function decayAccumulatedEntries(
  entries: EmotionStateSnapshot['accumulated'] | undefined,
  now: number
): EmotionStateSnapshot['accumulated'] {
  if (!entries?.length) {
    return []
  }

  return entries
    .map((entry) => {
      const decay = typeof entry.decay === 'number' && Number.isFinite(entry.decay)
        ? entry.decay
        : DEFAULT_ACCUMULATED_DECAY
      const intensity = clampEmotionAccumulatedIntensity(entry.intensity * decay)

      if (intensity < 0.25) {
        return null
      }

      return {
        ...entry,
        intensity,
        updatedAt: now
      }
    })
    .filter((entry): entry is EmotionAccumulatedEntry => Boolean(entry))
}

function normalizePersistedAccumulatedEntries(
  entries: EmotionStateSnapshot['accumulated'],
  now: number
): EmotionStateSnapshot['accumulated'] {
  return entries
    .map((entry) => ({
      label: normalizeEmotionLabel(entry.label) || 'neutral',
      description: entry.description.trim(),
      intensity: clampEmotionAccumulatedIntensity(entry.intensity),
      decay: typeof entry.decay === 'number' && Number.isFinite(entry.decay)
        ? entry.decay
        : DEFAULT_ACCUMULATED_DECAY,
      updatedAt: now
    }))
    .filter((entry) => entry.description.length > 0)
    .slice(0, 5)
}

function normalizeAccumulatedEntries(
  entries: Array<{
    label?: string
    description?: string
    intensity?: number
    decay?: number
  }> | undefined
): EmotionStateSnapshot['accumulated'] | undefined {
  if (!Array.isArray(entries)) {
    return undefined
  }

  const normalizedEntries = entries
    .map((entry): EmotionAccumulatedEntry | null => {
      const label = normalizeEmotionLabel(entry.label)
      const description = entry.description?.trim()

      if (!label || !description || typeof entry.intensity !== 'number') {
        return null
      }

      return {
        label,
        description,
        intensity: clampEmotionAccumulatedIntensity(entry.intensity),
        decay: typeof entry.decay === 'number' && Number.isFinite(entry.decay)
          ? entry.decay
          : DEFAULT_ACCUMULATED_DECAY,
        updatedAt: Date.now()
      }
    })
    .filter((entry): entry is EmotionAccumulatedEntry => entry !== null)
    .slice(0, 5)

  return normalizedEntries
}

function clampEmotionAccumulatedIntensity(value: number): number {
  return Math.max(1, Math.min(5, value))
}

function clampBackgroundIntensity(value: number): number {
  return Math.max(3, Math.min(7, value))
}

export { EMOTION_TOOL_NAME }
