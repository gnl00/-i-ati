import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB_EMOTION_STATE_GET_LATEST, PROVIDER_FETCH_MODELS } from '@shared/constants'
import { invokeDbEmotionStateGetLatest, invokeProviderFetchModels } from '..'

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

  it('invokes the provider fetch models channel with the selected account', async () => {
    const request = {
      account: {
        id: 'account-1',
        providerId: 'provider-1',
        label: 'Primary',
        apiUrl: 'https://ark.example.com/api/v3',
        apiKey: 'sk-secret-value',
        models: []
      } satisfies ProviderAccount
    }
    const response = {
      ok: true,
      endpoint: 'https://ark.example.com/api/v3/models',
      models: []
    }
    ipcRenderer.invoke.mockResolvedValue(response)

    await expect(invokeProviderFetchModels(request)).resolves.toEqual(response)

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(PROVIDER_FETCH_MODELS, request)
  })
})
