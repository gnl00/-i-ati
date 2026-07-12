import { ipcMain } from 'electron'
import { DB_EMOTION_STATE_GET_LATEST, EMOTION_PACKS_GET } from '@shared/constants'
import { chatDb } from '@main/db/chat'
import { emotionAssetService } from '@main/services/emotion/EmotionAssetService'

export function registerEmotionHandlers(): void {
  ipcMain.handle(EMOTION_PACKS_GET, async () => {
    return emotionAssetService.listAvailablePacks()
  })

  ipcMain.handle(DB_EMOTION_STATE_GET_LATEST, async () => {
    return chatDb.getLatestEmotionState()
  })
}
