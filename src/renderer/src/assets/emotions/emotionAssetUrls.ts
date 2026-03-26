import { EMOTION_ASSET_PROTOCOL } from '@shared/emotion/constants'
import { normalizeEmotionLabel } from '@shared/emotion/emotionAssetCatalog'

export function getEmotionAssetUrl(
  packName: string | undefined,
  label: string | undefined,
  emojiName: string | undefined
): string | undefined {
  const normalizedPackName = packName?.trim() || 'default'
  const normalizedLabel = normalizeEmotionLabel(label)
  const normalizedEmojiName = emojiName?.trim()

  if (!normalizedLabel || !normalizedEmojiName) {
    return undefined
  }

  return `${EMOTION_ASSET_PROTOCOL}://${encodeURIComponent(normalizedPackName)}/${encodeURIComponent(normalizedLabel)}/${encodeURIComponent(normalizedEmojiName)}.webp`
}
