import type { EmotionStateRow } from '@main/db/dao/EmotionStateDao'

type EmotionStateRowOverrides = Partial<Pick<EmotionStateRow, 'created_at' | 'updated_at'>>

export const toEmotionStateRow = (
  chatId: number,
  chatUuid: string,
  state: EmotionStateSnapshot,
  now: number,
  overrides: EmotionStateRowOverrides = {}
): EmotionStateRow => ({
  chat_id: chatId,
  chat_uuid: chatUuid,
  state_json: JSON.stringify(state),
  created_at: overrides.created_at ?? now,
  updated_at: overrides.updated_at ?? now
})

export const toEmotionStateEntity = (row: EmotionStateRow): EmotionStateSnapshot | undefined => {
  try {
    return JSON.parse(row.state_json) as EmotionStateSnapshot
  } catch {
    return undefined
  }
}
