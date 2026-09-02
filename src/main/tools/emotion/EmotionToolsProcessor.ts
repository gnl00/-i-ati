import type { EmotionReportArgs, EmotionReportResponse } from '@tools/emotion/index.d'
import { normalizeEmotionStimulus } from '@shared/emotion/emotionVector'

const EMOTION_STIMULUS_FIELDS = new Set(['impact', 'activation', 'control'])

export async function processEmotionReport(
  args: EmotionReportArgs
): Promise<EmotionReportResponse> {
  if (Object.keys(args).some(key => !EMOTION_STIMULUS_FIELDS.has(key))) {
    return {
      success: false,
      message: 'emotion_report accepts only impact, activation, and control.'
    }
  }

  const stimulus = normalizeEmotionStimulus(args)
  if (!stimulus) {
    return {
      success: false,
      message: 'impact, activation, and control must each be an integer between -2 and 2.'
    }
  }

  return {
    success: true,
    stimulus,
    message: `Emotion stimulus recorded: impact=${stimulus.impact}, activation=${stimulus.activation}, control=${stimulus.control}.`
  }
}
