import type { EmotionStateRow } from '@main/db/dao/EmotionStateDao'
import {
  EMOTION_BASELINE_VECTOR,
  normalizeEmotionStimulus,
  projectEmotionVector,
  vectorFromEmotionPresentation,
  ZERO_EMOTION_STIMULUS,
  type EmotionVector
} from '@shared/emotion/emotionVector'
import {
  normalizeEmotionLabel
} from '@shared/emotion/emotionAssetCatalog'

export const EMOTION_STATE_SCHEMA_VERSION = 2
const LEGACY_EMOTION_STATE_SCHEMA_VERSION = 1
const DEFAULT_INTENSITY = 5
const HISTORY_LIMIT = 10

type EmotionStateRowOverrides = Partial<Pick<EmotionStateRow, 'created_at' | 'updated_at'>>

type PersistedEmotionState = {
  schemaVersion: typeof EMOTION_STATE_SCHEMA_VERSION
  state: EmotionStateSnapshot
}

export type EmotionStateParseStatus = 'current' | 'migrated' | 'recovered'

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
  if (envelope?.schemaVersion === EMOTION_STATE_SCHEMA_VERSION) {
    const issues: string[] = []
    const state = normalizeV2State(envelope.state, row.updated_at, issues)
    return {
      state,
      status: issues.length > 0 ? 'recovered' : 'current',
      issues
    }
  }

  if (envelope?.schemaVersion === LEGACY_EMOTION_STATE_SCHEMA_VERSION) {
    const issues = ['migrated_v1']
    return {
      state: migrateV1State(envelope.state, row.updated_at, issues),
      status: 'migrated',
      issues
    }
  }

  return {
    state: createNeutralState(row.updated_at),
    status: 'recovered',
    issues: ['unsupported_schema']
  }
}

export const toEmotionStateEntity = (row: EmotionStateRow): EmotionStateSnapshot =>
  parseEmotionStateRow(row).state

const normalizeV2State = (
  value: unknown,
  fallbackUpdatedAt: number,
  issues: string[]
): EmotionStateSnapshot => {
  const state = asRecord(value)
  if (!state) {
    issues.push('state_not_object')
    return createNeutralState(fallbackUpdatedAt)
  }

  const baseline = normalizeBaseline(state.baseline, issues)
  const current = normalizeCurrentV2(state.current, fallbackUpdatedAt, issues)
  const history = normalizeHistoryV2(state.history, fallbackUpdatedAt, issues)

  return { current, baseline, history }
}

const normalizeBaseline = (
  value: unknown,
  issues: string[]
): EmotionVector => {
  const entry = normalizeVector(value)
  if (!entry) {
    issues.push('baseline')
    return { ...EMOTION_BASELINE_VECTOR }
  }

  if (
    entry.valence !== EMOTION_BASELINE_VECTOR.valence
    || entry.arousal !== EMOTION_BASELINE_VECTOR.arousal
    || entry.dominance !== EMOTION_BASELINE_VECTOR.dominance
  ) {
    issues.push('baseline.value')
    return { ...EMOTION_BASELINE_VECTOR }
  }

  return entry
}

const normalizeCurrentV2 = (
  value: unknown,
  fallbackUpdatedAt: number,
  issues: string[]
): EmotionStateEntry => {
  const entry = asRecord(value)
  const vector = normalizeVector(entry?.vector)
  const fallbackLabel = normalizeEmotionLabel(asString(entry?.label)) || 'neutral'
  const fallbackIntensity = normalizeIntensity(entry?.intensity)

  if (!vector) {
    issues.push('current.vector')
  }

  const resolvedVector = vector || vectorFromEmotionPresentation(fallbackLabel, fallbackIntensity)
  const projection = projectEmotionVector(resolvedVector)
  if (entry?.label !== projection.label) {
    issues.push('current.label')
  }
  if (normalizeIntensity(entry?.intensity) !== projection.intensity) {
    issues.push('current.intensity')
  }

  return {
    vector: resolvedVector,
    label: projection.label,
    intensity: projection.intensity,
    updatedAt: finiteTimestamp(entry?.updatedAt, fallbackUpdatedAt)
  }
}

const normalizeHistoryV2 = (
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
    const label = normalizeEmotionLabel(asString(entry?.label)) || 'neutral'
    const intensity = normalizeIntensity(entry?.intensity)
    const vector = normalizeVector(entry?.vector) || vectorFromEmotionPresentation(label, intensity)
    const stimulus = normalizeEmotionStimulus(entry?.stimulus) || { ...ZERO_EMOTION_STIMULUS }
    const source = normalizeSource(entry?.source)

    if (!normalizeVector(entry?.vector)) {
      issues.push(`history[${index}].vector`)
    }
    if (!normalizeEmotionStimulus(entry?.stimulus)) {
      issues.push(`history[${index}].stimulus`)
    }
    if (!source) {
      issues.push(`history[${index}].source`)
    }

    const projection = projectEmotionVector(vector)
    return [{
      vector,
      stimulus,
      label: projection.label,
      intensity: projection.intensity,
      timestamp: finiteTimestamp(entry?.timestamp, fallbackUpdatedAt),
      source: source || 'computed'
    }]
  }).slice(-HISTORY_LIMIT)
}

const migrateV1State = (
  value: unknown,
  fallbackUpdatedAt: number,
  issues: string[]
): EmotionStateSnapshot => {
  const state = asRecord(value)
  if (!state) {
    issues.push('state_not_object')
    return createNeutralState(fallbackUpdatedAt)
  }

  const legacyCurrent = asRecord(state.current)
  const label = normalizeEmotionLabel(asString(legacyCurrent?.label)) || 'neutral'
  const intensity = normalizeIntensity(legacyCurrent?.intensity)
  if (!normalizeEmotionLabel(asString(legacyCurrent?.label))) {
    issues.push('v1.current.label')
  }
  if (!isValidIntensity(legacyCurrent?.intensity)) {
    issues.push('v1.current.intensity')
  }

  const currentVector = vectorFromEmotionPresentation(label, intensity)
  const currentProjection = projectEmotionVector(currentVector)
  const currentUpdatedAt = finiteTimestamp(legacyCurrent?.updatedAt, fallbackUpdatedAt)
  const current: EmotionStateEntry = {
    vector: currentVector,
    label: currentProjection.label,
    intensity: currentProjection.intensity,
    updatedAt: currentUpdatedAt
  }

  const history = normalizeLegacyHistory(state.history, fallbackUpdatedAt, issues)
  history.push({
    vector: currentVector,
    stimulus: { ...ZERO_EMOTION_STIMULUS },
    label: current.label,
    intensity: current.intensity,
    timestamp: currentUpdatedAt,
    source: 'computed'
  })

  return {
    current,
    baseline: { ...EMOTION_BASELINE_VECTOR },
    history: history.slice(-HISTORY_LIMIT)
  }
}

const normalizeLegacyHistory = (
  value: unknown,
  fallbackUpdatedAt: number,
  issues: string[]
): EmotionStateHistoryEntry[] => {
  if (!Array.isArray(value)) {
    if (value != null) issues.push('v1.history')
    return []
  }

  return value.flatMap((candidate, index) => {
    const entry = asRecord(candidate)
    const label = normalizeEmotionLabel(asString(entry?.label))
    if (!label) {
      issues.push(`v1.history[${index}].label`)
      return []
    }
    const intensity = normalizeIntensity(entry?.intensity)
    if (!isValidIntensity(entry?.intensity)) {
      issues.push(`v1.history[${index}].intensity`)
    }
    const vector = vectorFromEmotionPresentation(label, intensity)
    const projection = projectEmotionVector(vector)
    return [{
      vector,
      stimulus: { ...ZERO_EMOTION_STIMULUS },
      label: projection.label,
      intensity: projection.intensity,
      timestamp: finiteTimestamp(entry?.timestamp, fallbackUpdatedAt),
      source: normalizeSource(entry?.source) || 'computed'
    }]
  }).slice(-HISTORY_LIMIT)
}

const createNeutralState = (updatedAt: number): EmotionStateSnapshot => {
  const vector = { ...EMOTION_BASELINE_VECTOR }
  const projection = projectEmotionVector(vector)
  return {
    current: {
      vector,
      label: projection.label,
      intensity: projection.intensity,
      updatedAt
    },
    baseline: { ...EMOTION_BASELINE_VECTOR },
    history: []
  }
}

const normalizeIntensity = (value: unknown): number => (
  isValidIntensity(value) ? Math.round(value) : DEFAULT_INTENSITY
)

const isValidIntensity = (value: unknown): value is number => (
  isFiniteNumber(value) && value >= 1 && value <= 10
)

const normalizeSource = (value: unknown): ChatEmotionState['source'] | undefined =>
  value === 'tool' || value === 'computed' ? value : undefined

const normalizeVector = (value: unknown): EmotionVector | undefined => {
  const entry = asRecord(value)
  if (
    !isFiniteNumber(entry?.valence) || entry.valence < 0 || entry.valence > 10
    || !isFiniteNumber(entry?.arousal) || entry.arousal < 0 || entry.arousal > 10
    || !isFiniteNumber(entry?.dominance) || entry.dominance < 0 || entry.dominance > 10
  ) {
    return undefined
  }

  return {
    valence: entry.valence,
    arousal: entry.arousal,
    dominance: entry.dominance
  }
}

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
