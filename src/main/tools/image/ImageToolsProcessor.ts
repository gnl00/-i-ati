import { imageAssetService } from '@main/services/images/ImageAssetService'
import type { EmbeddedToolExecutionContext } from '@shared/tools/registry'
import type { ImageShowArgs, ImageShowResult } from '@shared/tools/image/types'

export async function processImageShow(
  args: ImageShowArgs,
  context?: EmbeddedToolExecutionContext,
): Promise<ImageShowResult | { success: false; message: string }> {
  try {
    const result = await imageAssetService.prepare(
      args,
      context?.chatUuid,
      context?.signal,
    )
    context?.setModelContent?.(
      JSON.stringify({
        success: true,
        message:
          'Image prepared for display. Telegram delivery is recorded separately when applicable.',
        assetId: result.image.assetId,
        caption: result.caption,
      }),
    )
    return result
  } catch {
    return {
      success: false,
      message:
        'Unable to show image. Provide exactly one readable workspace-relative PNG, JPEG, WebP, or GIF file or HTTP(S) image URL (up to 50 MB), and an optional caption up to 1024 characters.',
    }
  }
}
