// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useWelcomeEmotionState,
  WELCOME_EMOTION_FALLBACK
} from '../useWelcomeEmotionState'

const { getLatestEmotionStateMock } = vi.hoisted(() => ({
  getLatestEmotionStateMock: vi.fn()
}))

vi.mock('@renderer/db/EmotionStateRepository', () => ({
  getLatestEmotionState: getLatestEmotionStateMock
}))

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useWelcomeEmotionState', () => {
  let container: HTMLDivElement
  let root: Root
  let latestEmotion: ReturnType<typeof useWelcomeEmotionState> | undefined

  function Probe() {
    latestEmotion = useWelcomeEmotionState()
    return null
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    latestEmotion = undefined
    getLatestEmotionStateMock.mockReset()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('starts from the welcome emotion fallback', async () => {
    getLatestEmotionStateMock.mockReturnValue(new Promise(() => {}))

    await act(async () => {
      root.render(<Probe />)
    })

    expect(latestEmotion).toEqual(WELCOME_EMOTION_FALLBACK)
  })

  it('maps the latest snapshot current emotion', async () => {
    getLatestEmotionStateMock.mockResolvedValue({
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

  it('falls back for unsupported labels', async () => {
    getLatestEmotionStateMock.mockResolvedValue({
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
    getLatestEmotionStateMock.mockRejectedValue(new Error('failed'))

    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await flushPromises()
    })

    expect(latestEmotion).toEqual(WELCOME_EMOTION_FALLBACK)
  })
})
