import type { EmotionStimulus } from '@shared/emotion/emotionVector'

export type EmotionReportArgs = {
  impact?: number
  activation?: number
  control?: number
}

export type EmotionReportResponse = {
  success: boolean
  stimulus?: EmotionStimulus
  message: string
}
