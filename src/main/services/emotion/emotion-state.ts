import {
  getEmotionAssetByName,
  normalizeEmotionLabel,
  pickEmotionAsset
} from '@shared/emotion/emotionAssetCatalog'

const EMOTION_TOOL_NAME = 'emotion_report'

function isEmotionToolName(name: string | undefined): boolean {
  return name === EMOTION_TOOL_NAME
}

export function mapEmotionLabelToEmoji(label: string | undefined): string {
  return pickEmotionAsset(label).emoji
}

export function hasVisibleAssistantText(content: string | VLMContent[] | undefined): content is string {
  return typeof content === 'string' && content.trim().length > 0
}

export function extractEmotionFromToolSegments(message: ChatMessage): ChatEmotionState | undefined {
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
      emojiName?: string
      emoji?: string
    } | undefined

    if (result?.success === false) {
      continue
    }

    const label = normalizeEmotionLabel(result?.label) || result?.label?.trim()
    const stateText = result?.stateText?.trim()
    const asset = getEmotionAssetByName(result?.emojiName)
    const emoji = result?.emoji?.trim() || asset?.emoji
    const emojiName = result?.emojiName?.trim() || asset?.name

    if (!label || !emoji) {
      continue
    }

    return {
      label,
      emoji,
      ...(emojiName ? { emojiName } : {}),
      ...(stateText ? { stateText } : {}),
      ...(typeof result?.intensity === 'number' ? { intensity: result.intensity } : {}),
      ...(result?.reason ? { reason: result.reason } : {}),
      source: 'tool'
    }
  }

  return undefined
}

export function buildFallbackEmotionState(
  label: string | undefined,
  score?: number
): ChatEmotionState {
  const asset = pickEmotionAsset(label, score)

  return {
    label: normalizeEmotionLabel(label) || 'neutral',
    emoji: asset.emoji,
    emojiName: asset.name,
    ...(typeof score === 'number' ? { score } : {}),
    source: 'fallback'
  }
}

export { EMOTION_TOOL_NAME }
