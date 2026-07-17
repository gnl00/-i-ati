import {
  clampEmotionIntensity,
  normalizeEmotionLabel,
  pickEmotionEmoji
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

export type EmotionTransitionInput = {
  previous?: EmotionStateSnapshot
  reported?: ExtractedEmotionToolState
  now: number
}

export type EmotionTransitionResult = {
  state: EmotionStateSnapshot
  changed: boolean
  presentation: ChatEmotionState
  diagnostics: EmotionTransitionDiagnostics
}

export type EmotionTransitionDiagnostics = {
  mode: 'reported' | 'carried_forward' | 'initialized'
  previous?: { label: string; intensity: number }
  requested?: { label: string; intensity: number }
  resolved: { label: string; intensity: number }
  intensityBounded: boolean
  backgroundAction: 'held' | 'drifted' | 'promoted' | 'initialized'
  accumulatedAction: 'rewritten' | 'decayed' | 'evicted' | 'empty'
  evictedCount: number
}

export function extractEmotionFromToolSegments(message: ChatMessage): ChatEmotionState | undefined {
  return extractEmotionToolStateFromSegments(message)?.emotion
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

export function deriveEmotionIntensity(emotion: ChatEmotionState): number {
  if (typeof emotion.intensity === 'number' && Number.isFinite(emotion.intensity)) {
    return clampEmotionIntensity(Math.round(emotion.intensity))
  }

  return DEFAULT_BACKGROUND_INTENSITY
}

export function transitionEmotionState(input: EmotionTransitionInput): EmotionTransitionResult {
  const { previous, reported, now } = input
  const baselineEmotion: ChatEmotionState = previous
    ? {
      label: previous.current.label,
      emoji: pickEmotionEmoji(previous.current.label, previous.current.intensity),
      intensity: previous.current.intensity,
      source: 'computed'
    }
    : {
      label: 'neutral',
      emoji: pickEmotionEmoji('neutral', DEFAULT_BACKGROUND_INTENSITY),
      intensity: DEFAULT_BACKGROUND_INTENSITY,
      source: 'computed'
    }
  const reportedEmotion = reported?.emotion
  const requestedIntensity = reportedEmotion
    ? deriveEmotionIntensity(reportedEmotion)
    : baselineEmotion.intensity!
  const intensity = previous && reportedEmotion
    ? clampEmotionIntensity(Math.max(
      previous.current.intensity - 2,
      Math.min(previous.current.intensity + 2, requestedIntensity)
    ))
    : requestedIntensity
  const presentation: ChatEmotionState = reportedEmotion
    ? {
      ...reportedEmotion,
      emoji: pickEmotionEmoji(reportedEmotion.label, intensity),
      intensity
    }
    : baselineEmotion
  const current: EmotionStateEntry = {
    label: presentation.label,
    intensity,
    updatedAt: reportedEmotion || !previous ? now : previous.current.updatedAt
  }

  const previousBackground = previous?.background
  const backgroundTransition = previousBackground
    ? reportedEmotion
      ? buildNextBackgroundState(previous, current, now)
      : { state: previousBackground, action: 'held' as const }
    : {
      state: {
        label: current.label,
        intensity: clampBackgroundIntensity(current.intensity),
        driftFactor: DEFAULT_BACKGROUND_DRIFT_FACTOR,
        updatedAt: now
      },
      action: 'initialized' as const
    }

  const accumulatedTransition = buildNextAccumulatedState(previous?.accumulated, reported, now)

  const history = reportedEmotion
    ? [...(previous?.history || []), {
      label: current.label,
      intensity: current.intensity,
      timestamp: now,
      source: 'tool' as const
    }].slice(-DEFAULT_HISTORY_LIMIT)
    : previous?.history || []

  const state = {
    current,
    background: backgroundTransition.state,
    accumulated: accumulatedTransition.entries,
    history
  }

  return {
    state,
    changed: !previous || !areEmotionStatesEquivalent(previous, state),
    presentation,
    diagnostics: {
      mode: reportedEmotion ? 'reported' : previous ? 'carried_forward' : 'initialized',
      ...(previous ? {
        previous: {
          label: previous.current.label,
          intensity: previous.current.intensity
        }
      } : {}),
      ...(reportedEmotion ? {
        requested: {
          label: reportedEmotion.label,
          intensity: requestedIntensity
        }
      } : {}),
      resolved: {
        label: current.label,
        intensity: current.intensity
      },
      intensityBounded: Boolean(reportedEmotion && requestedIntensity !== intensity),
      backgroundAction: backgroundTransition.action,
      accumulatedAction: accumulatedTransition.action,
      evictedCount: accumulatedTransition.evictedCount
    }
  }
}

function buildNextBackgroundState(
  previousState: EmotionStateSnapshot,
  current: EmotionStateEntry,
  now: number
): {
  state: EmotionStateSnapshot['background']
  action: EmotionTransitionDiagnostics['backgroundAction']
} {
  const previous = previousState.background
  if (previous.label !== current.label) {
    const recentMatchingReports = previousState.history
      .slice(-2)
      .every((entry) => entry.source === 'tool' && entry.label === current.label)

    if (previousState.history.length >= 2 && recentMatchingReports) {
      const direction = current.intensity === previous.intensity
        ? 0
        : current.intensity > previous.intensity ? 1 : -1

      return {
        state: {
          label: current.label,
          intensity: clampBackgroundIntensity(previous.intensity + (direction * previous.driftFactor)),
          driftFactor: previous.driftFactor,
          updatedAt: now
        },
        action: 'promoted'
      }
    }

    return { state: { ...previous }, action: 'held' }
  }

  const direction = current.intensity === previous.intensity
    ? 0
    : current.intensity > previous.intensity ? 1 : -1

  return {
    state: {
      ...previous,
      intensity: clampBackgroundIntensity(previous.intensity + (direction * previous.driftFactor)),
      updatedAt: now
    },
    action: direction === 0 ? 'held' : 'drifted'
  }
}

function buildNextAccumulatedState(
  previous: EmotionStateSnapshot['accumulated'] | undefined,
  reported: ExtractedEmotionToolState | undefined,
  now: number
): {
  entries: EmotionStateSnapshot['accumulated']
  action: EmotionTransitionDiagnostics['accumulatedAction']
  evictedCount: number
} {
  if (reported?.accumulated) {
    const entries = normalizePersistedAccumulatedEntries(reported.accumulated, now)
    return { entries, action: 'rewritten', evictedCount: 0 }
  }

  if (!previous?.length) {
    return { entries: [], action: 'empty', evictedCount: 0 }
  }

  const entries = normalizePersistedAccumulatedEntries(decayAccumulatedEntries(previous, now), now)
  const evictedCount = previous.length - entries.length
  return {
    entries,
    action: evictedCount > 0 ? 'evicted' : 'decayed',
    evictedCount
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
      const decayedIntensity = entry.intensity * decay

      if (decayedIntensity < 0.25) {
        return null
      }

      return {
        ...entry,
        intensity: clampEmotionAccumulatedIntensity(decayedIntensity),
        updatedAt: now
      }
    })
    .filter((entry): entry is EmotionAccumulatedEntry => Boolean(entry))
}

function normalizePersistedAccumulatedEntries(
  entries: EmotionStateSnapshot['accumulated'],
  now: number
): EmotionStateSnapshot['accumulated'] {
  const strongestByLabel = new Map<string, EmotionAccumulatedEntry>()
  for (const entry of entries) {
    const normalized: EmotionAccumulatedEntry = {
      label: normalizeEmotionLabel(entry.label) || 'neutral',
      intensity: clampEmotionAccumulatedIntensity(entry.intensity),
      decay: typeof entry.decay === 'number' && Number.isFinite(entry.decay)
        ? entry.decay
        : DEFAULT_ACCUMULATED_DECAY,
      updatedAt: now
    }
    const existing = strongestByLabel.get(normalized.label)
    if (!existing || normalized.intensity > existing.intensity) {
      strongestByLabel.set(normalized.label, normalized)
    }
  }
  return [...strongestByLabel.values()]
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 5)
}

function normalizeAccumulatedEntries(
  entries: Array<{
    label?: string
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
      if (!label || typeof entry.intensity !== 'number') {
        return null
      }

      return {
        label,
        intensity: clampEmotionAccumulatedIntensity(entry.intensity),
        decay: typeof entry.decay === 'number' && Number.isFinite(entry.decay)
          ? entry.decay
          : DEFAULT_ACCUMULATED_DECAY,
        updatedAt: Date.now()
      }
    })
    .filter((entry): entry is EmotionAccumulatedEntry => entry !== null)
  return normalizePersistedAccumulatedEntries(normalizedEntries, Date.now())
}

function clampEmotionAccumulatedIntensity(value: number): number {
  return Math.max(0.25, Math.min(5, value))
}

function clampBackgroundIntensity(value: number): number {
  return Math.max(3, Math.min(7, value))
}

function areEmotionStatesEquivalent(
  previous: EmotionStateSnapshot,
  next: EmotionStateSnapshot
): boolean {
  return JSON.stringify(previous) === JSON.stringify(next)
}

export { EMOTION_TOOL_NAME }
