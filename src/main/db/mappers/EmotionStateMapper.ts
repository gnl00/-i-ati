import type { EmotionStateRow } from '@main/db/dao/EmotionStateDao'
import {
  clampEmotionIntensity,
  normalizeEmotionLabel
} from '@shared/emotion/emotionAssetCatalog'

const EMOTION_STATE_SCHEMA_VERSION = 1
const DEFAULT_INTENSITY = 5
const DEFAULT_BACKGROUND_DRIFT_FACTOR = 0.1
const DEFAULT_ACCUMULATED_DECAY = 0.95
const HISTORY_LIMIT = 10

type EmotionStateRowOverrides = Partial<Pick<EmotionStateRow, 'created_at' | 'updated_at'>>

type PersistedEmotionState = {
  schemaVersion: typeof EMOTION_STATE_SCHEMA_VERSION
  state: EmotionStateSnapshot
}

export type EmotionStateParseStatus = 'current' | 'recovered'

export type EmotionStateParseResult = {
  state: EmotionStateSnapshot
  status: EmotionStateParseStatus
  issues: string[]
}

export const toEmotionStateRow = (
  state: EmotionStateSnapshot,
  now: number,
  overrides: EmotionStateRowOverrides = {}
): EmotionStateRow => ({
  scope: 'app',
  state_json: JSON.stringify({
    schemaVersion: EMOTION_STATE_SCHEMA_VERSION,
    state
  } satisfies PersistedEmotionState),
  created_at: overrides.created_at ?? now,
  updated_at: overrides.updated_at ?? now
})

export const parseEmotionStateRow = (row: EmotionStateRow): EmotionStateParseResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(row.state_json)
  } catch {
    return {
      state: createNeutralState(row.updated_at),
      status: 'recovered',
      issues: ['invalid_json']
    }
  }

  const envelope = asRecord(parsed)
  const isCurrentEnvelope = envelope?.schemaVersion === EMOTION_STATE_SCHEMA_VERSION
  if (!isCurrentEnvelope) {
    return {
      state: createNeutralState(row.updated_at),
      status: 'recovered',
      issues: ['unsupported_schema']
    }
  }

  const issues: string[] = []
  const state = normalizeState(envelope.state, row.updated_at, issues)

  return {
    state,
    status: issues.length > 0 ? 'recovered' : 'current',
    issues
  }
}

export const toEmotionStateEntity = (row: EmotionStateRow): EmotionStateSnapshot =>
  parseEmotionStateRow(row).state

const normalizeState = (
  value: unknown,
  fallbackUpdatedAt: number,
  issues: string[]
): EmotionStateSnapshot => {
  const state = asRecord(value)
  if (!state) {
    issues.push('state_not_object')
    return createNeutralState(fallbackUpdatedAt)
  }

  const current = normalizeCurrent(state.current, fallbackUpdatedAt, issues)
  const background = normalizeBackground(state.background, current, fallbackUpdatedAt, issues)
  const accumulated = normalizeAccumulated(state.accumulated, fallbackUpdatedAt, issues)
  const history = normalizeHistory(state.history, fallbackUpdatedAt, issues)

  return { current, background, accumulated, history }
}

const normalizeCurrent = (
  value: unknown,
  fallbackUpdatedAt: number,
  issues: string[]
): EmotionStateEntry => {
  const entry = asRecord(value)
  const label = normalizeEmotionLabel(asString(entry?.label))
  if (!label) issues.push('current.label')
  if (
    !isFiniteNumber(entry?.intensity)
    || entry.intensity < 1
    || entry.intensity > 10
  ) issues.push('current.intensity')

  return {
    label: label || 'neutral',
    intensity: clampEmotionIntensity(
      isFiniteNumber(entry?.intensity) ? entry.intensity : DEFAULT_INTENSITY
    ),
    updatedAt: finiteTimestamp(entry?.updatedAt, fallbackUpdatedAt)
  }
}

const normalizeBackground = (
  value: unknown,
  current: EmotionStateEntry,
  fallbackUpdatedAt: number,
  issues: string[]
): EmotionStateSnapshot['background'] => {
  const entry = asRecord(value)
  const label = normalizeEmotionLabel(asString(entry?.label))
  if (!label) issues.push('background.label')
  if (
    !isFiniteNumber(entry?.intensity)
    || entry.intensity < 3
    || entry.intensity > 7
  ) issues.push('background.intensity')
  if (!isFiniteNumber(entry?.driftFactor) || entry.driftFactor <= 0) {
    issues.push('background.driftFactor')
  }

  const intensity = isFiniteNumber(entry?.intensity)
    ? entry.intensity
    : current.intensity

  return {
    label: label || current.label,
    intensity: Math.max(3, Math.min(7, intensity)),
    driftFactor: isFiniteNumber(entry?.driftFactor) && entry.driftFactor > 0
      ? entry.driftFactor
      : DEFAULT_BACKGROUND_DRIFT_FACTOR,
    updatedAt: finiteTimestamp(entry?.updatedAt, fallbackUpdatedAt)
  }
}

const normalizeAccumulated = (
  value: unknown,
  fallbackUpdatedAt: number,
  issues: string[]
): EmotionAccumulatedEntry[] => {
  if (value == null) {
    issues.push('accumulated')
    return []
  }
  if (!Array.isArray(value)) {
    issues.push('accumulated')
    return []
  }

  const normalized = value.flatMap((candidate, index) => {
    const entry = asRecord(candidate)
    const label = normalizeEmotionLabel(asString(entry?.label))
    const intensity = entry?.intensity
    const decay = entry?.decay

    if (!label || !isFiniteNumber(intensity)) {
      issues.push(`accumulated[${index}]`)
      return []
    }
    if (intensity < 0.25 || intensity > 5) {
      issues.push(`accumulated[${index}].intensity`)
    }
    if (!isFiniteNumber(decay) || decay < 0.9 || decay > 0.99) {
      issues.push(`accumulated[${index}].decay`)
    }

    return [{
      label,
      intensity: Math.max(0.25, Math.min(5, intensity)),
      decay: isFiniteNumber(decay)
        ? Math.max(0.9, Math.min(0.99, decay))
        : DEFAULT_ACCUMULATED_DECAY,
      updatedAt: finiteTimestamp(entry?.updatedAt, fallbackUpdatedAt)
    }]
  })

  const strongestByLabel = new Map<string, EmotionAccumulatedEntry>()
  for (const entry of normalized) {
    const previous = strongestByLabel.get(entry.label)
    if (!previous || entry.intensity > previous.intensity) {
      strongestByLabel.set(entry.label, entry)
    }
  }

  return Array.from(strongestByLabel.values()).slice(0, 5)
}

const normalizeHistory = (
  value: unknown,
  fallbackUpdatedAt: number,
  issues: string[]
): EmotionStateHistoryEntry[] => {
  if (value == null) {
    issues.push('history')
    return []
  }
  if (!Array.isArray(value)) {
    issues.push('history')
    return []
  }

  return value.flatMap((candidate, index) => {
    const entry = asRecord(candidate)
    const label = normalizeEmotionLabel(asString(entry?.label))
    const source = normalizeSource(entry?.source)
    if (!label || !isFiniteNumber(entry?.intensity) || !source) {
      issues.push(`history[${index}]`)
      return []
    }
    if (entry.intensity < 1 || entry.intensity > 10) {
      issues.push(`history[${index}].intensity`)
    }

    return [{
      label,
      intensity: clampEmotionIntensity(entry.intensity),
      timestamp: finiteTimestamp(entry.timestamp, fallbackUpdatedAt),
      source
    }]
  }).slice(-HISTORY_LIMIT)
}

const createNeutralState = (updatedAt: number): EmotionStateSnapshot => ({
  current: {
    label: 'neutral',
    intensity: DEFAULT_INTENSITY,
    updatedAt
  },
  background: {
    label: 'neutral',
    intensity: DEFAULT_INTENSITY,
    driftFactor: DEFAULT_BACKGROUND_DRIFT_FACTOR,
    updatedAt
  },
  accumulated: [],
  history: []
})

const normalizeSource = (value: unknown): ChatEmotionState['source'] | undefined =>
  value === 'tool' || value === 'computed' ? value : undefined

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const finiteTimestamp = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) && value >= 0 ? value : fallback

export { EMOTION_STATE_SCHEMA_VERSION }
