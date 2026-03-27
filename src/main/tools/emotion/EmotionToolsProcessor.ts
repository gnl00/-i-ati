import type { EmotionReportArgs, EmotionReportResponse } from '@tools/emotion/index.d'
import {
  clampEmotionIntensity,
  normalizeEmotionLabel,
  pickEmotionEmoji,
} from '@shared/emotion/emotionAssetCatalog'

// const ALLOWED_EMOTION_EMOJIS = new Set([
//   '😀',
//   '🙂',
//   '😊',
//   '😌',
//   '🤔',
//   '😐',
//   '😴',
//   '😤',
//   '😠',
//   '😡',
//   '😞',
//   '😢',
//   '😭',
//   '😰',
//   '😨'
// ])

const DEFAULT_INTENSITY = 5
const MAX_STATE_TEXT_LENGTH = 64
const MAX_REASON_LENGTH = 160
const MAX_ACCUMULATED_DESCRIPTION_LENGTH = 80
const MIN_ACCUMULATED_DECAY = 0.9
const MAX_ACCUMULATED_DECAY = 0.99

const parseIntensity = (value?: number): number | undefined => {
  if (value == null) {
    return DEFAULT_INTENSITY
  }

  if (!Number.isInteger(value) || value < 1 || value > 10) {
    return undefined
  }

  return value
}

export async function processEmotionReport(
  args: EmotionReportArgs
): Promise<EmotionReportResponse> {
  const label = normalizeEmotionLabel(args.label)
  const stateText = args.stateText?.trim() || undefined
  const reason = args.reason?.trim() || undefined
  if (!label) {
    return {
      success: false,
      intensity: DEFAULT_INTENSITY,
      message: 'label is required and must be one of the supported emotion labels.'
    }
  }
  if (stateText && stateText.length > MAX_STATE_TEXT_LENGTH) {
    return {
      success: false,
      intensity: DEFAULT_INTENSITY,
      message: `stateText must be at most ${MAX_STATE_TEXT_LENGTH} characters.`
    }
  }
  if (reason && reason.length > MAX_REASON_LENGTH) {
    return {
      success: false,
      intensity: DEFAULT_INTENSITY,
      message: `reason must be at most ${MAX_REASON_LENGTH} characters.`
    }
  }
  const intensity = parseIntensity(args.intensity)
  if (intensity == null) {
    return {
      success: false,
      intensity: DEFAULT_INTENSITY,
      message: 'intensity must be an integer between 1 and 10.'
    }
  }

  const accumulated = normalizeAccumulated(args.accumulated)
  if (accumulated instanceof Error) {
    return {
      success: false,
      intensity: DEFAULT_INTENSITY,
      message: accumulated.message
    }
  }

  const normalizedIntensity = clampEmotionIntensity(intensity)
  const emoji = pickEmotionEmoji(label, normalizedIntensity)

  return {
    success: true,
    label,
    ...(stateText ? { stateText } : {}),
    emoji,
    intensity: normalizedIntensity,
    reason,
    ...(accumulated ? { accumulated } : {}),
    message: reason
      ? `Emotion recorded: ${emoji} ${label} (${normalizedIntensity}/10). Reason: ${reason}`
      : `Emotion recorded: ${emoji} ${label} (${normalizedIntensity}/10).`
  }
}

function normalizeAccumulated(
  value: EmotionReportArgs['accumulated']
): EmotionReportArgs['accumulated'] | Error | undefined {
  if (value == null) {
    return undefined
  }

  if (!Array.isArray(value)) {
    return new Error('accumulated must be an array when provided.')
  }

  const normalized = value.map((entry, index) => {
    const label = normalizeEmotionLabel(entry?.label)
    const description = entry?.description?.trim()
    const intensity = entry?.intensity
    const decay = entry?.decay

    if (!label) {
      return new Error(`accumulated[${index}].label must be one of the supported emotion labels.`)
    }
    if (!description) {
      return new Error(`accumulated[${index}].description is required.`)
    }
    if (description.length > MAX_ACCUMULATED_DESCRIPTION_LENGTH) {
      return new Error(`accumulated[${index}].description must be at most ${MAX_ACCUMULATED_DESCRIPTION_LENGTH} characters.`)
    }
    if (typeof intensity !== 'number' || !Number.isInteger(intensity) || intensity < 1 || intensity > 5) {
      return new Error(`accumulated[${index}].intensity must be an integer between 1 and 5.`)
    }
    if (typeof decay !== 'number' || !Number.isFinite(decay) || decay < MIN_ACCUMULATED_DECAY || decay > MAX_ACCUMULATED_DECAY) {
      return new Error(`accumulated[${index}].decay must be a number between ${MIN_ACCUMULATED_DECAY} and ${MAX_ACCUMULATED_DECAY}.`)
    }

    const normalizedIntensity = intensity

    return {
      label,
      description,
      intensity: normalizedIntensity,
      decay
    }
  })

  const firstError = normalized.find((entry): entry is Error => entry instanceof Error)
  if (firstError) {
    return firstError
  }

  return normalized as EmotionReportArgs['accumulated']
}
