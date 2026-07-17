export type EmotionAccumulatedArg = {
  label?: string
  intensity?: number
  decay?: number
}

export type EmotionReportArgs = {
  label?: string
  stateText?: string
  intensity?: number
  reason?: string
  accumulated?: EmotionAccumulatedArg[]
}

export type EmotionReportResponse = {
  success: boolean
  label?: string
  stateText?: string
  emoji?: string
  intensity: number
  reason?: string
  accumulated?: EmotionAccumulatedArg[]
  message: string
}
