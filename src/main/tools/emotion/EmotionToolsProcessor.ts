import type { EmotionReportArgs, EmotionReportResponse } from '@tools/emotion/index.d'
import {
  getEmotionAssetByName,
  isEmotionAssetValidForLabel,
  normalizeEmotionLabel
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

const clampIntensity = (value?: number): number => {
  if (!Number.isFinite(value)) return 5
  return Math.min(Math.max(Math.round(value as number), 1), 10)
}

export async function processEmotionReport(
  args: EmotionReportArgs
): Promise<EmotionReportResponse> {
  const label = normalizeEmotionLabel(args.label)
  const stateText = args.stateText?.trim() || undefined
  const emojiName = args.emojiName?.trim()
  if (!label) {
    return {
      success: false,
      intensity: 5,
      message: 'label is required and must be one of the supported emotion labels.'
    }
  }
  if (!emojiName) {
    return {
      success: false,
      intensity: 5,
      message: 'emojiName is required.'
    }
  }
  const asset = getEmotionAssetByName(emojiName)
  if (!asset) {
    return {
      success: false,
      intensity: 5,
      message: `emojiName is invalid: ${emojiName}`
    }
  }
  if (!isEmotionAssetValidForLabel(label, emojiName)) {
    return {
      success: false,
      intensity: 5,
      message: `emojiName ${emojiName} does not match label ${label}`
    }
  }

  const intensity = clampIntensity(args.intensity)
  const reason = args.reason?.trim() || undefined

  return {
    success: true,
    label,
    ...(stateText ? { stateText } : {}),
    emoji: asset.emoji,
    emojiName: asset.name,
    intensity,
    reason,
    message: reason
      ? `Emotion recorded: ${asset.emoji} ${label} via ${asset.name} (${intensity}/10). Reason: ${reason}`
      : `Emotion recorded: ${asset.emoji} ${label} via ${asset.name} (${intensity}/10).`
  }
}
