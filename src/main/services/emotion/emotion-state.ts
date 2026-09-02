import {
  pickEmotionEmoji
} from '@shared/emotion/emotionAssetCatalog'
import {
  applyEmotionStimulus,
  EMOTION_BASELINE_VECTOR,
  EMOTION_HISTORY_LIMIT,
  emotionVectorDistance,
  normalizeEmotionStimulus,
  projectEmotionVector,
  ZERO_EMOTION_STIMULUS,
  type EmotionStimulus
} from '@shared/emotion/emotionVector'

const EMOTION_TOOL_NAME = 'emotion_report'

type ExtractedEmotionToolState = {
  stimulus: EmotionStimulus
}

export type EmotionTransitionInput = {
  previous?: EmotionStateSnapshot
  reported?: ExtractedEmotionToolState
  now: number
}

export type EmotionTransitionResult = {
  state: EmotionStateSnapshot
  changed: boolean
  presentation: ChatEmotionState
  diagnostics: EmotionTransitionDiagnostics
}

export type EmotionTransitionDiagnostics = {
  mode: 'reported' | 'decayed' | 'initialized'
  previous?: {
    label: string
    intensity: number
    vector: EmotionStateEntry['vector']
  }
  requested?: EmotionStimulus
  resolved: {
    label: string
    intensity: number
    vector: EmotionStateEntry['vector']
  }
  historyAction: 'recorded' | 'unchanged' | 'initialized'
}

export function extractEmotionToolStateFromSegments(message: ChatMessage): ExtractedEmotionToolState | undefined {
  const segments = Array.isArray(message.segments) ? message.segments : []

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]
    if (segment.type !== 'toolCall') continue

    const toolName = typeof segment.content?.toolName === 'string'
      ? segment.content.toolName
      : segment.name

    if (toolName !== EMOTION_TOOL_NAME || segment.isError) {
      continue
    }

    const result = segment.content?.result as Record<string, unknown> | undefined
    if (result?.success === false) {
      continue
    }

    const stimulus = normalizeEmotionStimulus(result?.stimulus)
    if (!stimulus) {
      continue
    }

    return { stimulus }
  }

  return undefined
}

export function transitionEmotionState(input: EmotionTransitionInput): EmotionTransitionResult {
  const { previous, reported, now } = input
  const stimulus = reported?.stimulus || ZERO_EMOTION_STIMULUS
  const currentVector = applyEmotionStimulus(previous?.current.vector, stimulus)
  const projection = projectEmotionVector(currentVector)
  const presentation: ChatEmotionState = {
    label: projection.label,
    emoji: pickEmotionEmoji(projection.label, projection.intensity),
    intensity: projection.intensity,
    source: 'computed'
  }
  const vectorChanged = Boolean(
    previous && emotionVectorDistance(previous.current.vector, currentVector) > 0
  )
  const shouldRecordHistory = Boolean(reported || vectorChanged)
  const current: EmotionStateEntry = {
    label: presentation.label,
    intensity: presentation.intensity!,
    vector: currentVector,
    updatedAt: shouldRecordHistory ? now : previous?.current.updatedAt || now
  }
  const historyAction: EmotionTransitionDiagnostics['historyAction'] = !previous && !reported
    ? 'initialized'
    : shouldRecordHistory
      ? 'recorded'
      : 'unchanged'
  const history = shouldRecordHistory
    ? [
      ...(previous?.history || []),
      {
        vector: currentVector,
        stimulus: { ...stimulus },
        label: current.label,
        intensity: current.intensity,
        timestamp: now,
        source: reported ? 'tool' as const : 'computed' as const
      }
    ].slice(-EMOTION_HISTORY_LIMIT)
    : previous?.history || []

  const state: EmotionStateSnapshot = {
    current,
    baseline: { ...EMOTION_BASELINE_VECTOR },
    history
  }

  return {
    state,
    changed: !previous || !areEmotionStatesEquivalent(previous, state),
    presentation,
    diagnostics: {
      mode: reported ? 'reported' : previous ? 'decayed' : 'initialized',
      ...(previous ? {
        previous: {
          label: previous.current.label,
          intensity: previous.current.intensity,
          vector: previous.current.vector
        }
      } : {}),
      ...(reported ? { requested: { ...reported.stimulus } } : {}),
      resolved: {
        label: current.label,
        intensity: current.intensity,
        vector: current.vector
      },
      historyAction
    }
  }
}

function areEmotionStatesEquivalent(
  previous: EmotionStateSnapshot,
  next: EmotionStateSnapshot
): boolean {
  return areEmotionVectorsEqual(previous.current.vector, next.current.vector)
    && previous.current.label === next.current.label
    && previous.current.intensity === next.current.intensity
    && previous.current.updatedAt === next.current.updatedAt
    && areEmotionVectorsEqual(previous.baseline, next.baseline)
    && JSON.stringify(previous.history) === JSON.stringify(next.history)
}

function areEmotionVectorsEqual(
  previous: EmotionStateEntry['vector'],
  next: EmotionStateEntry['vector']
): boolean {
  return previous.valence === next.valence
    && previous.arousal === next.arousal
    && previous.dominance === next.dominance
}

export { EMOTION_TOOL_NAME }
