import { EMOTION_ASSET_PROTOCOL } from '@shared/emotion/constants'
import { normalizeEmotionLabel } from '@shared/emotion/emotionAssetCatalog'

export function getEmotionAssetUrl(
  packName: string | undefined,
  label: string | undefined,
  intensity: number | undefined
): string | undefined {
  const normalizedPackName = packName?.trim() || 'default'
  const normalizedLabel = normalizeEmotionLabel(label)

  if (!normalizedLabel) {
    return undefined
  }

  const resolvedIntensity = typeof intensity === 'number' && Number.isFinite(intensity)
    ? Math.max(1, Math.min(10, Math.round(intensity)))
    : 5

  return `${EMOTION_ASSET_PROTOCOL}://${encodeURIComponent(normalizedPackName)}/${encodeURIComponent(normalizedLabel)}/${resolvedIntensity}.webp`
}
