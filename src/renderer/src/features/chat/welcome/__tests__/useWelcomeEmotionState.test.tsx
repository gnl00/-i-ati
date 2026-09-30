// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useWelcomeEmotionState,
  WELCOME_EMOTION_FALLBACK
} from '../useWelcomeEmotionState'
import SmartWelcomeEntrance from '../SmartWelcomeEntrance'

const { getEmotionStateMock } = vi.hoisted(() => ({
  getEmotionStateMock: vi.fn()
}))

vi.mock('@renderer/infrastructure/persistence/EmotionStateRepository', () => ({
  getEmotionState: getEmotionStateMock
}))

vi.mock('@renderer/infrastructure/persistence/SmartMessageRepository', () => ({
  getActiveSmartMessages: async (): Promise<[]> => []
}))

vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: (selector: (state: { appConfig: { emotion: { assetPack: string } } }) => unknown): unknown =>
    selector({ appConfig: { emotion: { assetPack: 'default' } } })
}))

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useWelcomeEmotionState', () => {
  let container: HTMLDivElement
  let root: Root
  let latestEmotion: ReturnType<typeof useWelcomeEmotionState> | undefined

  function Probe(): null {
    latestEmotion = useWelcomeEmotionState()
    return null
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestEmotion = undefined
    getEmotionStateMock.mockReset()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('waits for persistence before choosing an emotion', async () => {
    getEmotionStateMock.mockReturnValue(new Promise(() => {}))

    await act(async () => {
      root.render(<Probe />)
    })

    expect(latestEmotion).toBeUndefined()
    expect(getEmotionStateMock).toHaveBeenCalledTimes(1)
  })

  it('maps the latest snapshot current emotion', async () => {
    getEmotionStateMock.mockResolvedValue({
      current: {
        label: ' Happiness ',
        intensity: 8.6,
        updatedAt: 1710000000000
      }
    })

    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await flushPromises()
    })

    expect(latestEmotion).toEqual({
      label: 'happiness',
      intensity: 9
    })
  })

  it('mounts only the persisted image after the initial read completes', async () => {
    let resolveSnapshot!: (snapshot: unknown) => void
    getEmotionStateMock.mockReturnValue(new Promise(resolve => { resolveSnapshot = resolve }))
    await act(async () => root.render(<SmartWelcomeEntrance />))
    expect(container.querySelector('.welcome-v2-emotion-asset')).toBeNull()
    expect(container.querySelector('.welcome-v2-emotion-emoji')).toBeNull()

    await act(async () => resolveSnapshot({ current: { label: 'neutral', intensity: 9 } }))
    expect(container.querySelector('.welcome-v2-emotion-asset')?.getAttribute('src'))
      .toBe('emotion-asset://default/neutral/9.webp')
    expect(getEmotionStateMock).toHaveBeenCalledTimes(1)
  })

  it('mounts the default image only after persistence returns no state', async () => {
    let resolveSnapshot!: (snapshot: unknown) => void
    getEmotionStateMock.mockReturnValue(new Promise(resolve => { resolveSnapshot = resolve }))
    await act(async () => root.render(<SmartWelcomeEntrance />))
    expect(container.querySelector('.welcome-v2-emotion-asset')).toBeNull()

    await act(async () => resolveSnapshot(undefined))
    expect(container.querySelector('.welcome-v2-emotion-asset')?.getAttribute('src'))
      .toBe('emotion-asset://default/happiness/4.webp')
    expect(getEmotionStateMock).toHaveBeenCalledTimes(1)
  })

  it('falls back for unsupported labels', async () => {
    getEmotionStateMock.mockResolvedValue({
      current: {
        label: 'unknown',
        intensity: 8,
        updatedAt: 1710000000000
      }
    })

    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await flushPromises()
    })

    expect(latestEmotion).toEqual(WELCOME_EMOTION_FALLBACK)
  })

  it('falls back when loading fails', async () => {
    getEmotionStateMock.mockRejectedValue(new Error('failed'))

    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await flushPromises()
    })

    expect(latestEmotion).toEqual(WELCOME_EMOTION_FALLBACK)
  })
})
