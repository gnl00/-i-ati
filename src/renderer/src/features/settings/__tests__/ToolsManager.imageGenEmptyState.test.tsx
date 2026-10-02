// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: (): unknown => ({ appConfig: {}, getModelOptions: (): never[] => [], resolveModelRef: (): undefined => undefined, plugins: [] }),
}))
vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeTelegramGatewayStatus: async (): Promise<{ running: boolean }> => ({ running: false }),
  invokeEmotionPacksGet: async (): Promise<never[]> => [],
}))
import ToolsManager from '../ToolsManager'

describe('image generation empty state', () => {
  it('explains the missing model and opens provider configuration from Add model', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const configure = vi.fn()
    const noop = (): void => {}
    try {
      await act(async () => root.render(<ToolsManager
        onConfigureImageGenModel={configure}
        maxWebSearchItems={3} setMaxWebSearchItems={noop}
        telegramEnabled={false} setTelegramEnabled={noop}
        telegramBotToken="" setTelegramBotToken={noop}
        emotionAssetPack="default" setEmotionAssetPack={noop}
        compressionEnabled={true} setCompressionEnabled={noop}
        compressionTriggerTokenRatio={0.7} setCompressionTriggerTokenRatio={noop}
        streamChunkDebugEnabled={false} setStreamChunkDebugEnabled={noop}
      />))
      expect(container.textContent).toContain('No image models available')
      expect(container.textContent).toContain('Generate images with the selected model.')
      const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Add model')!
      expect(button.title).toBe('Add an image generation model in Providers')
      await act(async () => button.click())
      expect(configure).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
