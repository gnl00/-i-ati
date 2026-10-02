import { isBuiltInRequestAdapterPluginEnabled } from '@shared/plugins/requestAdapters'
import { pluginDb } from '@main/db/plugins'
import { configDb } from '@main/db/config'
import { createUnifiedTextRequest } from '@main/request/UnifiedRequestFactory'
import { unifiedChatRequest } from '@main/request'
import { imageAssetService } from '@main/services/images/ImageAssetService'
import { isImageGenModelRefAvailable } from '@shared/services/ChatModelResolver'
import type { EmbeddedToolExecutionContext } from '@shared/tools/registry'
import type {
  ImageGenerateArgs,
  ImageShowResult,
} from '@shared/tools/image/types'

const CONFIG_GUIDANCE =
  'Add an image generation model using the OpenAI Image Compatible adapter in Settings → Providers, then select it in Settings → Tools → Model Routing → Image Gen Model and save your settings.'
const MAX_IMAGE_BYTES = 50 * 1024 * 1024

export type ImageGenerateDeps = {
  getConfig?: () => IAppConfig | null | undefined
  request?: typeof unifiedChatRequest
  assets?: Pick<typeof imageAssetService, 'prepare' | 'prepareBytes'>
  timeoutMs?: number
}

export async function processImageGenerate(
  args: ImageGenerateArgs,
  context?: EmbeddedToolExecutionContext,
  deps: ImageGenerateDeps = {},
): Promise<
  ImageShowResult | { success: false; code: string; message: string }
> {
  const failure = (
    code: string,
    message: string,
  ): { success: false; code: string; message: string } => ({
    success: false,
    code,
    message,
  })
  if (
    !args ||
    typeof args.prompt !== 'string' ||
    !args.prompt.trim() ||
    args.prompt.length > 16000 ||
    (args.caption !== undefined &&
      (typeof args.caption !== 'string' || args.caption.length > 1024))
  ) {
    return failure(
      'IMAGE_GEN_INVALID_ARGUMENTS',
      'Provide a non-empty prompt up to 16000 characters and an optional plain-text caption up to 1024 characters.',
    )
  }
  let timeout: ReturnType<typeof setTimeout> | undefined
  let signal: AbortSignal | undefined
  let onAbort: (() => void) | undefined
  let generated = false
  const controller = new AbortController()
  try {
    const config = (
      deps.getConfig ??
      ((): IAppConfig | undefined => {
        const config = configDb.getConfig()
        return (
          config && {
            ...config,
            plugins: { items: pluginDb.getPluginConfigs() },
          }
        )
      })
    )()
    const ref = config?.tools?.imageGenModel
    if (!ref)
      return failure(
        'IMAGE_GEN_MODEL_NOT_CONFIGURED',
        `Image generation model is not configured. ${CONFIG_GUIDANCE}`,
      )
    if (!config || !isImageGenModelRefAvailable(config, ref)) {
      return failure(
        'IMAGE_GEN_MODEL_UNAVAILABLE',
        `The selected image generation model is unavailable or does not support the configured adapter. ${CONFIG_GUIDANCE}`,
      )
    }
    const account = config.accounts!.find((item) => item.id === ref.accountId)!
    const model = account.models.find((item) => item.id === ref.modelId)!
    const definition = config.providerDefinitions!.find(
      (item) => item.id === account.providerId,
    )!
    if (definition.adapterPluginId !== 'openai-image-compatible-adapter'
      || !isBuiltInRequestAdapterPluginEnabled(config.plugins?.items, 'openai-image-compatible-adapter')) {
      return failure(
        'IMAGE_GEN_MODEL_UNAVAILABLE',
        `The selected image generation model's adapter is unsupported or disabled. ${CONFIG_GUIDANCE}`,
      )
    }
    timeout = setTimeout(
      () => controller.abort(new Error('Image generation timed out.')),
      deps.timeoutMs ?? 180000,
    )
    signal = context?.signal
      ? AbortSignal.any([context.signal, controller.signal])
      : controller.signal
    signal.throwIfAborted()
    const aborted = new Promise<never>((_, reject) => {
      onAbort = (): void => reject(signal!.reason)
      signal!.addEventListener('abort', onAbort, { once: true })
    })
    const response = await Promise.race([
      (deps.request ?? unifiedChatRequest)(
        createUnifiedTextRequest({
          adapterPluginId: definition.adapterPluginId,
          baseUrl: account.apiUrl,
          apiKey: account.apiKey,
          model: model.id,
          modelType: model.type,
          content: args.prompt.trim(),
          stream: false,
        }),
        signal,
        () => {},
        () => {},
      ),
      aborted,
    ])
    signal.throwIfAborted()
    const content: unknown = response?.content
    if (
      !Array.isArray(content) ||
      content.length !== 1 ||
      !content[0] ||
      typeof content[0] !== 'object'
    ) {
      return failure(
        'IMAGE_GEN_INVALID_RESPONSE',
        'The image generation provider did not return one image. No automatic retry was attempted.',
      )
    }
    generated = true
    const image = content[0] as { b64_json?: unknown; url?: unknown }
    const assets = deps.assets ?? imageAssetService
    let publication: Promise<ImageShowResult>
    if (typeof image.b64_json === 'string') {
      const base64 = image.b64_json
      if (
        !base64 ||
        base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
        base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
      ) {
        return failure(
          'IMAGE_GEN_INVALID_RESPONSE',
          'The provider returned invalid or oversized image data. No automatic retry was attempted.',
        )
      }
      publication = assets.prepareBytes(
        Buffer.from(base64, 'base64'),
        args.caption,
        signal,
      )
    } else if (typeof image.url === 'string') {
      publication = assets.prepare(
        { url: image.url, caption: args.caption },
        context?.chatUuid,
        signal,
      )
    } else {
      return failure(
        'IMAGE_GEN_INVALID_RESPONSE',
        'The provider returned no usable image URL or base64 data. No automatic retry was attempted.',
      )
    }
    const result = await Promise.race([publication, aborted])
    signal.throwIfAborted()
    context?.setModelContent?.(
      JSON.stringify({
        success: true,
        message:
          'One image generated and prepared for display. Telegram delivery is recorded separately when applicable.',
        assetId: result.image.assetId,
        caption: result.caption,
        model: model.id,
      }),
    )
    return result
  } catch {
    if (context?.signal?.aborted)
      return failure(
        'IMAGE_GEN_ABORTED',
        'Image generation was cancelled. The provider may have processed the request; no automatic retry was attempted.',
      )
    if (controller.signal.aborted)
      return failure(
        'IMAGE_GEN_TIMEOUT',
        'Image generation timed out. The provider may have processed the request; no automatic retry was attempted.',
      )
    return failure(
      'IMAGE_GEN_FAILED',
      generated
        ? 'The provider returned an image, but it could not be saved for display. No automatic retry was attempted.'
        : 'Image generation failed. Check the selected model, provider credentials, and connection. No automatic retry was attempted.',
    )
  } finally {
    if (timeout) clearTimeout(timeout)
    if (signal && onAbort) signal.removeEventListener('abort', onAbort)
  }
}
