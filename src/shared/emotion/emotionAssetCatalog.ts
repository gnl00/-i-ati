export type EmotionLabel =
  | 'sadness'
  | 'anger'
  | 'love'
  | 'surprise'
  | 'fear'
  | 'happiness'
  | 'neutral'
  | 'disgust'
  | 'shame'
  | 'guilt'
  | 'confusion'
  | 'desire'
  | 'sarcasm'

const EMOTION_EMOJI_CATALOG: Record<EmotionLabel, string[]> = {
  sadness: ['😔', '😢', '😭'],
  anger: ['😤', '😠', '😡'],
  love: ['🤗', '😘', '🥰'],
  surprise: ['😯', '😲', '🤯'],
  fear: ['😟', '😨', '😱'],
  happiness: ['🙂', '😊', '🤣'],
  neutral: ['😶', '😐', '😑'],
  disgust: ['😒', '🤢', '🤮'],
  shame: ['🤭', '😳', '🫠'],
  guilt: ['🥲', '😮‍💨', '😓'],
  confusion: ['😕', '🤔', '🤨'],
  desire: ['😏', '🤩', '🤤'],
  sarcasm: ['😉', '😏', '🙃']
}

export const EMOTION_LABELS = Object.keys(EMOTION_EMOJI_CATALOG) as EmotionLabel[]

export function normalizeEmotionLabel(label: string | undefined): EmotionLabel | undefined {
  const normalized = label?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  return normalized in EMOTION_EMOJI_CATALOG
    ? normalized as EmotionLabel
    : undefined
}

export function clampEmotionIntensity(value: number | undefined, fallback = 5): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.min(10, Math.round(value)))
}

export function scoreToEmotionIntensity(score: number | undefined): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return 5
  }

  return clampEmotionIntensity(1 + (score * 9))
}

export function pickEmotionEmoji(
  label: string | undefined,
  intensity?: number
): string {
  const normalized = normalizeEmotionLabel(label) || 'neutral'
  const candidates = EMOTION_EMOJI_CATALOG[normalized]
  const resolvedIntensity = clampEmotionIntensity(intensity)
  const index = pickVariantIndexFromIntensity(candidates.length, resolvedIntensity) - 1
  return candidates[index] || candidates[candidates.length - 1] || '😐'
}

export function pickVariantIndexFromIntensity(
  variantCount: number,
  intensity?: number
): number {
  if (!Number.isFinite(variantCount) || variantCount <= 1) {
    return 1
  }

  const resolvedIntensity = clampEmotionIntensity(intensity)
  const ratio = resolvedIntensity / 10
  return Math.max(1, Math.min(variantCount, Math.ceil(ratio * variantCount)))
}
