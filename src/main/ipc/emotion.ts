import { ipcMain } from 'electron'
import { EMOTION_PACKS_GET } from '@shared/constants'
import { emotionAssetService } from '@main/services/emotion/EmotionAssetService'

export function registerEmotionHandlers(): void {
  ipcMain.handle(EMOTION_PACKS_GET, async () => {
    return emotionAssetService.listAvailablePacks()
  })
}
