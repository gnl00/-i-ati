import { invokeDbEmotionStateGetLatest } from '@renderer/infrastructure/ipc'

export const getLatestEmotionState = async (): Promise<EmotionStateSnapshot | undefined> => {
  return await invokeDbEmotionStateGetLatest()
}
