import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@main/db/plugins', () => ({ pluginDb: { getPluginConfigs: vi.fn() } }))
vi.mock('@main/db/config', () => ({ configDb: { getConfig: vi.fn() } }))
vi.mock('@main/request', () => ({ unifiedChatRequest: vi.fn() }))
vi.mock('@main/services/images/ImageAssetService', () => ({
  imageAssetService: { prepare: vi.fn(), prepareBytes: vi.fn() },
}))
import { processImageGenerate } from '../ImageGenerateProcessor'

const config = (): IAppConfig => ({
  tools: {
    imageGenModel: { accountId: 'image-account', modelId: 'image-model' },
  },
  providerDefinitions: [
    {
      id: 'image-provider',
      displayName: 'Images',
      adapterPluginId: 'openai-image-compatible-adapter',
    },
  ],
  accounts: [
    {
      id: 'image-account',
      providerId: 'image-provider',
      label: 'Images',
      apiKey: 'private-key',
      apiUrl: 'https://example.test/v1',
      models: [{ id: 'image-model', label: 'Image', type: 'img_gen' }],
    },
  ],
})
const result = {
  kind: 'image_show' as const,
  success: true as const,
  image: {
    assetId: `${'a'.repeat(64)}.png`,
    url: `image-asset://snapshot/${'a'.repeat(64)}.png`,
    mimeType: 'image/png',
    size: 4,
    width: 1,
    height: 1,
  },
}

describe('image_generate', () => {
  const request = vi.fn()
  const assets = { prepare: vi.fn(), prepareBytes: vi.fn() }
  beforeEach(() => {
    vi.resetAllMocks()
    assets.prepare.mockResolvedValue(result)
    assets.prepareBytes.mockResolvedValue(result)
  })
  const run = (
    value = config(),
    context = {},
    args = { prompt: 'Draw a tree', caption: 'Tree' },
    timeoutMs?: number,
  ): ReturnType<typeof processImageGenerate> =>
    processImageGenerate(args, context, {
      getConfig: () => value,
      request,
      assets,
      timeoutMs,
    })

  it('returns configuration guidance without making a request or falling back', async () => {
    const value = config()
    value.tools = {
      mainModel: { accountId: 'image-account', modelId: 'image-model' },
    }
    expect(await run(value)).toMatchObject({
      success: false,
      code: 'IMAGE_GEN_MODEL_NOT_CONFIGURED',
      message: expect.stringContaining(
        'Settings → Tools → Model Routing → Image Gen Model',
      ),
    })
    expect(request).not.toHaveBeenCalled()
  })
  it.each([
    'deleted',
    'disabled',
    'wrong-type',
    'wrong-adapter',
    'disabled-provider',
    'disabled-plugin',
  ])('rejects a %s route before dispatch', async (kind) => {
    const value = config()
    if (kind === 'deleted') value.accounts = []
    if (kind === 'disabled') value.accounts![0].models[0].enabled = false
    if (kind === 'wrong-type') value.accounts![0].models[0].type = 'vlm'
    if (kind === 'wrong-adapter')
      value.providerDefinitions![0].adapterPluginId =
        'openai-chat-compatible-adapter'
    if (kind === 'disabled-provider')
      value.providerDefinitions![0].enabled = false
    if (kind === 'disabled-plugin')
      value.plugins = {
        items: [
          { id: 'openai-image-compatible-adapter', enabled: false },
        ] as AppPluginConfig[],
      }
    expect(await run(value)).toMatchObject({
      code: 'IMAGE_GEN_MODEL_UNAVAILABLE',
    })
    expect(request).not.toHaveBeenCalled()
  })
  it('uses the explicit model, publishes base64 privately and bounds model content', async () => {
    request.mockResolvedValue({ content: [{ b64_json: 'aW1hZ2U=' }] })
    const setModelContent = vi.fn()
    expect(await run(config(), { setModelContent })).toEqual(result)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toMatchObject({
      model: 'image-model',
      adapterPluginId: 'openai-image-compatible-adapter',
      stream: false,
      messages: [{ role: 'user', content: 'Draw a tree' }],
    })
    expect(assets.prepareBytes.mock.calls[0][0]).toEqual(Buffer.from('image'))
    expect(setModelContent.mock.calls[0][0]).not.toMatch(
      /aW1hZ2U|private-key|image-asset/,
    )
  })
  it('snapshots a provider URL with trusted context', async () => {
    request.mockResolvedValue({
      content: [{ url: 'https://example.test/image?token=private' }],
    })
    await run(config(), { chatUuid: 'runtime-chat' })
    expect(assets.prepare).toHaveBeenCalledWith(
      { url: 'https://example.test/image?token=private', caption: 'Tree' },
      'runtime-chat',
      expect.any(AbortSignal),
    )
  })
  it.each([
    undefined,
    [],
    [{ text: 'none' }],
    [{ b64_json: 'bad!' }],
    [{ url: 'a' }, { url: 'b' }],
  ])('rejects invalid output %j', async (content) => {
    request.mockResolvedValue({ content })
    expect(await run()).toMatchObject({ code: 'IMAGE_GEN_INVALID_RESPONSE' })
    expect(assets.prepare).not.toHaveBeenCalled()
    expect(assets.prepareBytes).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('reports storage failure without leaking response secrets or repeating generation', async () => {
    request.mockResolvedValue({
      content: [{ url: 'https://example.test/image?token=private' }],
    })
    assets.prepare.mockRejectedValue(
      new Error('private-key token=private /private/path'),
    )
    const output = await run()
    expect(output).toMatchObject({
      code: 'IMAGE_GEN_FAILED',
      message: expect.stringContaining('could not be saved'),
    })
    expect(JSON.stringify(output)).not.toMatch(
      /private-key|token=private|\/private/,
    )
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('redacts provider failure', async () => {
    request.mockRejectedValue(
      new Error('private-key data:image/png;base64,SECRET'),
    )
    expect(await run()).toMatchObject({ code: 'IMAGE_GEN_FAILED' })
    expect(JSON.stringify(await run())).not.toMatch(/private-key|SECRET/)
  })
  it('cancels an in-flight request even when the provider ignores abort', async () => {
    request.mockImplementation(() => new Promise(() => {}))
    const controller = new AbortController()
    const pending = run(config(), { signal: controller.signal })
    controller.abort()
    expect(await pending).toMatchObject({ code: 'IMAGE_GEN_ABORTED' })
    expect(request.mock.calls[0][1].aborted).toBe(true)
    expect(assets.prepare).not.toHaveBeenCalled()
  })
  it('times out once without automatic retry', async () => {
    request.mockImplementation(() => new Promise(() => {}))
    expect(await run(config(), {}, undefined, 5)).toMatchObject({
      code: 'IMAGE_GEN_TIMEOUT',
    })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('does not dispatch an already cancelled call', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await run(config(), { signal: controller.signal })).toMatchObject({
      code: 'IMAGE_GEN_ABORTED',
    })
    expect(request).not.toHaveBeenCalled()
  })
  it.each([
    { prompt: '' },
    { prompt: 'x', caption: 'x'.repeat(1025) },
    { prompt: 'x'.repeat(16001) },
  ])('validates arguments before dispatch', async (args) => {
    expect(
      await processImageGenerate(args, undefined, { request }),
    ).toMatchObject({ code: 'IMAGE_GEN_INVALID_ARGUMENTS' })
    expect(request).not.toHaveBeenCalled()
  })
})
