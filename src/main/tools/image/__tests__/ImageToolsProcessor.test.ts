import { describe, expect, it, vi } from 'vitest'
const prepare = vi.hoisted(() => vi.fn())
vi.mock('@main/services/images/ImageAssetService', () => ({
  imageAssetService: { prepare },
}))
import { processImageShow } from '../ImageToolsProcessor'

describe('image_show tool', () => {
  it('passes trusted runtime context and keeps model content bounded', async () => {
    const result = {
      kind: 'image_show',
      success: true,
      image: {
        assetId: 'snapshot.png',
        url: 'image-asset://snapshot/snapshot.png',
      },
    }
    prepare.mockResolvedValueOnce(result)
    const setModelContent = vi.fn()
    const signal = new AbortController().signal
    expect(
      await processImageShow(
        { file: 'picture.png' },
        { chatUuid: 'runtime-chat', signal, setModelContent },
      ),
    ).toEqual(result)
    expect(prepare).toHaveBeenCalledWith(
      { file: 'picture.png' },
      'runtime-chat',
      signal,
    )
    expect(setModelContent.mock.calls[0][0]).not.toContain('image-asset:')
    expect(setModelContent.mock.calls[0][0]).not.toContain('data:image')
  })
  it('does not leak signed URLs or filesystem paths on errors', async () => {
    prepare.mockRejectedValueOnce(new Error('secret-token /private/file'))
    const result = await processImageShow({
      url: 'https://example.test/a?token=secret-token',
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain('secret-token')
    expect(JSON.stringify(result)).not.toContain('/private/file')
  })
})
