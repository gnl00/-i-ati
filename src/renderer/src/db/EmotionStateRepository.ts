import { invokeDbEmotionStateGetLatest } from '@renderer/invoker/ipcInvoker'

export const getLatestEmotionState = async (): Promise<EmotionStateSnapshot | undefined> => {
  return await invokeDbEmotionStateGetLatest()
}
