import { invokeDbEmotionStateGet } from '@renderer/infrastructure/ipc'

export const getEmotionState = async (): Promise<EmotionStateSnapshot | undefined> => {
  return await invokeDbEmotionStateGet()
}
