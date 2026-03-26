export type EmotionReportArgs = {
  label?: string
  stateText?: string
  emojiName?: string
  intensity?: number
  reason?: string
}

export type EmotionReportResponse = {
  success: boolean
  label?: string
  stateText?: string
  emoji?: string
  emojiName?: string
  intensity: number
  reason?: string
  message: string
}
