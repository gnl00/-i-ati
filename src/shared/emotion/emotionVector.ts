import type { EmotionLabel } from './emotionAssetCatalog'
import {
  clampEmotionIntensity,
  EMOTION_LABELS
} from './emotionAssetCatalog'

export type EmotionVector = {
  valence: number
  arousal: number
  dominance: number
}

export type EmotionStimulus = {
  impact: number
  activation: number
  control: number
}

export type EmotionProjection = {
  label: EmotionLabel
  intensity: number
  distance: number
}

export const EMOTION_BASELINE_VECTOR: EmotionVector = {
  valence: 5,
  arousal: 3,
  dominance: 5
}

export const EMOTION_RETENTION: EmotionVector = {
  valence: 0.8,
  arousal: 0.5,
  dominance: 0.7
}

export const EMOTION_STIMULUS_GAIN = 1
export const EMOTION_HISTORY_LIMIT = 10
export const EMOTION_VECTOR_SNAP_EPSILON = 0.05

export const ZERO_EMOTION_STIMULUS: EmotionStimulus = {
  impact: 0,
  activation: 0,
  control: 0
}

export const EMOTION_VAD_CENTROIDS: Record<EmotionLabel, EmotionVector> = {
  sadness: { valence: 2, arousal: 2, dominance: 4 },
  anger: { valence: 1.5, arousal: 8, dominance: 8 },
  love: { valence: 7.5, arousal: 3.5, dominance: 6 },
  surprise: { valence: 5.5, arousal: 6, dominance: 5 },
  fear: { valence: 2, arousal: 6, dominance: 2.5 },
  happiness: { valence: 7.5, arousal: 5.5, dominance: 5.5 },
  neutral: { valence: 5, arousal: 3, dominance: 5 },
  disgust: { valence: 2.5, arousal: 5.5, dominance: 6 },
  shame: { valence: 2, arousal: 2.5, dominance: 2 },
  guilt: { valence: 1.5, arousal: 3, dominance: 1.5 },
  confusion: { valence: 4.5, arousal: 5, dominance: 3.5 },
  desire: { valence: 7.5, arousal: 7.5, dominance: 7 },
  sarcasm: { valence: 4, arousal: 6.5, dominance: 8.5 }
}

const EMOTION_VAD_DISTANCE_WEIGHTS: EmotionVector = {
  valence: 1.25,
  arousal: 1,
  dominance: 0.75
}

export function normalizeEmotionStimulus(value: unknown): EmotionStimulus | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const impact = parseStimulusDelta(value.impact)
  const activation = parseStimulusDelta(value.activation)
  const control = parseStimulusDelta(value.control)
  if (impact == null || activation == null || control == null) {
    return undefined
  }

  return { impact, activation, control }
}

export function applyEmotionStimulus(
  previous: EmotionVector | undefined,
  stimulus: EmotionStimulus
): EmotionVector {
  const source = previous || EMOTION_BASELINE_VECTOR
  return {
    valence: transitionAxis(source.valence, EMOTION_BASELINE_VECTOR.valence, EMOTION_RETENTION.valence, stimulus.impact),
    arousal: transitionAxis(source.arousal, EMOTION_BASELINE_VECTOR.arousal, EMOTION_RETENTION.arousal, stimulus.activation),
    dominance: transitionAxis(source.dominance, EMOTION_BASELINE_VECTOR.dominance, EMOTION_RETENTION.dominance, stimulus.control)
  }
}

export function projectEmotionVector(vector: EmotionVector): EmotionProjection {
  let closestLabel: EmotionLabel = 'neutral'
  let closestDistance = Number.POSITIVE_INFINITY

  for (const label of EMOTION_LABELS) {
    const distance = weightedDistance(vector, EMOTION_VAD_CENTROIDS[label])
    if (distance < closestDistance) {
      closestLabel = label
      closestDistance = distance
    }
  }

  const baselineDistance = weightedDistance(vector, EMOTION_BASELINE_VECTOR)
  return {
    label: closestLabel,
    intensity: clampEmotionIntensity(5 + (baselineDistance * 1.25)),
    distance: closestDistance
  }
}

export function vectorFromEmotionPresentation(
  label: EmotionLabel,
  intensity: number
): EmotionVector {
  const center = EMOTION_VAD_CENTROIDS[label]
  const scale = clampEmotionIntensity(intensity) / 10
  return {
    valence: clampVectorAxis(EMOTION_BASELINE_VECTOR.valence + ((center.valence - EMOTION_BASELINE_VECTOR.valence) * scale)),
    arousal: clampVectorAxis(EMOTION_BASELINE_VECTOR.arousal + ((center.arousal - EMOTION_BASELINE_VECTOR.arousal) * scale)),
    dominance: clampVectorAxis(EMOTION_BASELINE_VECTOR.dominance + ((center.dominance - EMOTION_BASELINE_VECTOR.dominance) * scale))
  }
}

export function emotionVectorDistance(a: EmotionVector, b: EmotionVector): number {
  return weightedDistance(a, b)
}

function transitionAxis(
  previous: number,
  baseline: number,
  retention: number,
  delta: number
): number {
  const next = baseline + (retention * (previous - baseline)) + (EMOTION_STIMULUS_GAIN * delta)
  const clamped = clampVectorAxis(next)
  return Math.abs(clamped - baseline) <= EMOTION_VECTOR_SNAP_EPSILON
    ? baseline
    : clamped
}

function weightedDistance(a: EmotionVector, b: EmotionVector): number {
  return Math.sqrt(
    (EMOTION_VAD_DISTANCE_WEIGHTS.valence * ((a.valence - b.valence) ** 2))
    + (EMOTION_VAD_DISTANCE_WEIGHTS.arousal * ((a.arousal - b.arousal) ** 2))
    + (EMOTION_VAD_DISTANCE_WEIGHTS.dominance * ((a.dominance - b.dominance) ** 2))
  )
}

function parseStimulusDelta(value: unknown): number | undefined {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= -2
    && value <= 2
    ? value
    : undefined
}

function clampVectorAxis(value: number): number {
  return Math.max(0, Math.min(10, Number.isFinite(value) ? value : 5))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
