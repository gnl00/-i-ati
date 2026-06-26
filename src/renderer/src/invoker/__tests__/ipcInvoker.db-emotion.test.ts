import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB_EMOTION_STATE_GET_LATEST } from '@shared/constants'
import { invokeDbEmotionStateGetLatest } from '../ipcInvoker'

describe('ipcInvoker emotion state calls', () => {
  const ipcRenderer = {
    invoke: vi.fn()
  }

  beforeEach(() => {
    ipcRenderer.invoke.mockReset()
    ;(globalThis as any).window = { electron: { ipcRenderer } }
  })

  it('invokes the latest emotion state channel', async () => {
    const snapshot = {
      current: {
        label: 'happiness',
        intensity: 8,
        updatedAt: 1710000000000
      }
    }
    ipcRenderer.invoke.mockResolvedValue(snapshot)

    await expect(invokeDbEmotionStateGetLatest()).resolves.toEqual(snapshot)

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(DB_EMOTION_STATE_GET_LATEST)
  })
})
