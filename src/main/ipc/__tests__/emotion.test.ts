import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB_EMOTION_STATE_GET, EMOTION_PACKS_GET } from '@shared/constants'

const { ipcMainHandleMock, getEmotionStateMock, listAvailablePacksMock } = vi.hoisted(() => ({
  ipcMainHandleMock: vi.fn(),
  getEmotionStateMock: vi.fn(),
  listAvailablePacksMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainHandleMock
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getEmotionState: getEmotionStateMock
  }
}))

vi.mock('@main/services/emotion/EmotionAssetService', () => ({
  emotionAssetService: {
    listAvailablePacks: listAvailablePacksMock
  }
}))

describe('registerEmotionHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
    getEmotionStateMock.mockReset()
    listAvailablePacksMock.mockReset()
  })

  it('registers emotion handlers', async () => {
    const { registerEmotionHandlers } = await import('../emotion')

    registerEmotionHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)
    expect(registeredChannels).toContain(EMOTION_PACKS_GET)
    expect(registeredChannels).toContain(DB_EMOTION_STATE_GET)
  })

  it('reads the latest emotion state from DatabaseService', async () => {
    const snapshot = {
      current: {
        label: 'happiness',
        intensity: 8,
        updatedAt: 1710000000000
      }
    }
    getEmotionStateMock.mockReturnValue(snapshot)

    const { registerEmotionHandlers } = await import('../emotion')
    registerEmotionHandlers()

    const handler = ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === DB_EMOTION_STATE_GET
    )?.[1]

    await expect(handler({})).resolves.toEqual(snapshot)
    expect(getEmotionStateMock).toHaveBeenCalledTimes(1)
  })
})
