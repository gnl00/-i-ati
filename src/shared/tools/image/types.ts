export const IMAGE_ASSET_PROTOCOL = 'image-asset'

export interface ImageShowArgs {
  file?: string
  url?: string
  caption?: string
}

export interface ImageTelegramDelivery {
  botId?: string
  state: 'sending' | 'sent' | 'failed' | 'unknown'
  chatId: string
  threadId?: string
  messageId?: number
  method?: 'photo' | 'document'
}

export interface ImageShowResult {
  kind: 'image_show'
  success: true
  image: {
    assetId: string
    url: string
    mimeType: string
    size: number
    width: number
    height: number
  }
  caption?: string
  telegram?: ImageTelegramDelivery
}

export function parseImageShowResult(
  value: unknown,
): ImageShowResult | undefined {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (!value || typeof value !== 'object') return undefined
  const result = value as ImageShowResult
  if (result.kind !== 'image_show' || result.success !== true || !result.image)
    return undefined
  const image = result.image
  if (
    typeof image.assetId !== 'string' ||
    !/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(image.assetId)
  )
    return undefined
  if (image.url !== `${IMAGE_ASSET_PROTOCOL}://snapshot/${image.assetId}`)
    return undefined
  if (
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
      image.mimeType,
    )
  )
    return undefined
  if (
    ![image.size, image.width, image.height].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    return undefined
  if (
    result.caption !== undefined &&
    (typeof result.caption !== 'string' || result.caption.length > 1024)
  )
    return undefined
  if (
    result.telegram &&
    (!['sending', 'sent', 'failed', 'unknown'].includes(
      result.telegram.state,
    ) ||
      typeof result.telegram.chatId !== 'string')
  )
    return undefined
  return result
}

export interface ImageGenerateArgs {
  prompt: string
  caption?: string
}

export const isImageDisplayTool = (name?: string): boolean =>
  name === 'image_show' || name === 'image_generate'
