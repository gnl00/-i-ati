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

export type EmotionAsset = {
  name: string
  emoji: string
}

const EMOTION_ASSET_CATALOG: Record<EmotionLabel, EmotionAsset[]> = {
  sadness: [
    { name: 'Loudly Crying Face', emoji: '😭' },
    { name: 'Crying Face', emoji: '😢' },
    { name: 'Pensive Face', emoji: '😔' }
  ],
  anger: [
    { name: 'Pouting Face', emoji: '😡' },
    { name: 'Angry Face', emoji: '😠' },
    { name: 'Face With Steam From Nose', emoji: '😤' }
  ],
  love: [
    { name: 'Smiling Face With Hearts', emoji: '🥰' },
    { name: 'Face Blowing A Kiss', emoji: '😘' },
    { name: 'Hugging Face', emoji: '🤗' }
  ],
  surprise: [
    { name: 'Exploding Head', emoji: '🤯' },
    { name: 'Astonished Face', emoji: '😲' },
    { name: 'Hushed Face', emoji: '😯' }
  ],
  fear: [
    { name: 'Face Screaming In Fear', emoji: '😱' },
    { name: 'Fearful Face', emoji: '😨' },
    { name: 'Worried Face', emoji: '😟' }
  ],
  happiness: [
    { name: 'Rolling On The Floor Laughing', emoji: '🤣' },
    { name: 'Smiling Face With Smiling Eyes', emoji: '😊' },
    { name: 'Slightly Smiling Face', emoji: '🙂' }
  ],
  neutral: [
    { name: 'Neutral Face', emoji: '😐' },
    { name: 'Expressionless Face', emoji: '😑' },
    { name: 'Face Without Mouth', emoji: '😶' }
  ],
  disgust: [
    { name: 'Face Vomiting', emoji: '🤮' },
    { name: 'Nauseated Face', emoji: '🤢' },
    { name: 'Unamused Face', emoji: '😒' }
  ],
  shame: [
    { name: 'Melting Face', emoji: '🫠' },
    { name: 'Flushed Face', emoji: '😳' },
    { name: 'Face With Hand Over Mouth', emoji: '🤭' }
  ],
  guilt: [
    { name: 'Downcast Face With Sweat', emoji: '😓' },
    { name: 'Face Exhaling', emoji: '😮‍💨' },
    { name: 'Smiling Face With Tear', emoji: '🥲' }
  ],
  confusion: [
    { name: 'Confused Face', emoji: '😕' },
    { name: 'Thinking Face', emoji: '🤔' },
    { name: 'Face With Raised Eyebrow', emoji: '🤨' }
  ],
  desire: [
    { name: 'Drooling Face', emoji: '🤤' },
    { name: 'Star Struck', emoji: '🤩' },
    { name: 'Smirking Face', emoji: '😏' }
  ],
  sarcasm: [
    { name: 'Upside Down Face', emoji: '🙃' },
    { name: 'Smirking Face', emoji: '😏' },
    { name: 'Winking Face', emoji: '😉' }
  ]
}

const ASSET_BY_NAME = new Map<string, EmotionAsset>(
  Object.values(EMOTION_ASSET_CATALOG)
    .flat()
    .map(asset => [asset.name, asset])
)

export const EMOTION_ASSET_NAMES = Array.from(ASSET_BY_NAME.keys())
export const EMOTION_LABELS = Object.keys(EMOTION_ASSET_CATALOG) as EmotionLabel[]

export function normalizeEmotionLabel(label: string | undefined): EmotionLabel | undefined {
  const normalized = label?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  return normalized in EMOTION_ASSET_CATALOG
    ? normalized as EmotionLabel
    : undefined
}

export function getEmotionAssetByName(name: string | undefined): EmotionAsset | undefined {
  if (!name) {
    return undefined
  }

  return ASSET_BY_NAME.get(name.trim())
}

export function pickEmotionAsset(
  label: string | undefined,
  score?: number
): EmotionAsset {
  const normalized = normalizeEmotionLabel(label)
  const candidates = normalized
    ? EMOTION_ASSET_CATALOG[normalized]
    : EMOTION_ASSET_CATALOG.neutral

  const confidence = typeof score === 'number' ? score : 0

  if (confidence >= 0.8) {
    return candidates[0]
  }
  if (confidence >= 0.55) {
    return candidates[1] || candidates[0]
  }
  return candidates[2] || candidates[1] || candidates[0]
}

export function isEmotionAssetValidForLabel(
  label: string | undefined,
  assetName: string | undefined
): boolean {
  const normalized = normalizeEmotionLabel(label)
  if (!normalized || !assetName) {
    return false
  }

  return EMOTION_ASSET_CATALOG[normalized].some(asset => asset.name === assetName.trim())
}
