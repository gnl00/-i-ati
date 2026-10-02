import { app, nativeImage, net, protocol } from 'electron'
import { imageSize } from 'image-size'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveWorkspacePath } from '@main/services/filesystem/WorkspacePathResolver'
import {
  IMAGE_ASSET_PROTOCOL,
  type ImageShowArgs,
  type ImageShowResult,
} from '@shared/tools/image/types'

const MAX_IMAGE_BYTES = 50 * 1024 * 1024
const ASSET_ID = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/

function identifyImage(data: Buffer): { extension: string; mimeType: string } {
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { extension: 'png', mimeType: 'image/png' }
  if (data[0] === 255 && data[1] === 216 && data[2] === 255)
    return { extension: 'jpg', mimeType: 'image/jpeg' }
  if (
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  )
    return { extension: 'webp', mimeType: 'image/webp' }
  if (/^GIF8[79]a$/.test(data.toString('ascii', 0, 6)))
    return { extension: 'gif', mimeType: 'image/gif' }
  throw new Error('Unsupported image. Use PNG, JPEG, WebP, or GIF.')
}

export class ImageAssetService {
  constructor(
    private readonly root: () => string = () =>
      join(app.getPath('userData'), 'image-snapshots'),
  ) {}

  async prepare(
    args: ImageShowArgs,
    chatUuid?: string,
    signal?: AbortSignal,
  ): Promise<ImageShowResult> {
    if ((typeof args.file === 'string') === (typeof args.url === 'string'))
      throw new Error('Provide exactly one file or url.')
    if (
      args.caption !== undefined &&
      (typeof args.caption !== 'string' || args.caption.length > 1024)
    )
      throw new Error('caption must be plain text of at most 1024 characters.')
    signal?.throwIfAborted()
    let data: Buffer
    if (args.file !== undefined) {
      const path = resolveWorkspacePath(args.file, {
        chatUuid,
        mode: 'embedded-relative',
        intent: 'existing',
      }).absolutePath
      const handle = await open(path, 'r')
      try {
        const info = await handle.stat()
        if (!info.isFile() || info.size === 0 || info.size > MAX_IMAGE_BYTES)
          throw new Error('Image must be a file between 1 byte and 50 MB.')
        data = await handle.readFile()
      } finally {
        await handle.close()
      }
    } else {
      const url = new URL(args.url!)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error(
          'Use an HTTP(S) image URL without embedded credentials.',
        )
      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000)
      const response = await net.fetch(url.href, { signal: requestSignal })
      if (!response.ok || !response.body)
        throw new Error('Unable to download image.')
      if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
        await response.body.cancel()
        throw new Error('Image exceeds 50 MB.')
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > MAX_IMAGE_BYTES) throw new Error('Image exceeds 50 MB.')
          chunks.push(chunk.value)
        }
      } finally {
        await reader.cancel()
      }
      data = Buffer.concat(chunks)
    }
    return this.prepareBytes(data, args.caption, signal)
  }

  async prepareBytes(data: Buffer, caption?: string, signal?: AbortSignal): Promise<ImageShowResult> {
    if (caption !== undefined && (typeof caption !== 'string' || caption.length > 1024))
      throw new Error('caption must be plain text of at most 1024 characters.')
    signal?.throwIfAborted()
    if (!data.length || data.length > MAX_IMAGE_BYTES)
      throw new Error('Image must be between 1 byte and 50 MB.')
    const format = identifyImage(data)
    const { width, height } = imageSize(data)
    if (!width || !height) throw new Error('Unable to read image dimensions.')
    // Electron's native decoder supports PNG/JPEG; Chromium displays WebP/GIF.
    if (
      ['png', 'jpg'].includes(format.extension) &&
      nativeImage.createFromBuffer(data).isEmpty()
    ) {
      throw new Error('Unable to decode image.')
    }
    const assetId = `${createHash('sha256').update(data).digest('hex')}.${format.extension}`
    await mkdir(this.root(), { recursive: true })
    const temporaryPath = join(this.root(), `${randomUUID()}.tmp`)
    try {
      await writeFile(temporaryPath, data, { flag: 'wx' })
      signal?.throwIfAborted()
      await rename(temporaryPath, join(this.root(), assetId))
    } finally {
      await rm(temporaryPath, { force: true })
    }
    return {
      kind: 'image_show',
      success: true,
      image: {
        assetId,
        url: `${IMAGE_ASSET_PROTOCOL}://snapshot/${assetId}`,
        mimeType: format.mimeType,
        size: data.length,
        width,
        height,
      },
      ...(caption?.trim() ? { caption: caption.trim() } : {}),
    }
  }

  async read(assetId: string): Promise<Buffer> {
    if (!ASSET_ID.test(assetId)) throw new Error('Invalid image asset.')
    return readFile(join(this.root(), assetId))
  }

  registerProtocol(): void {
    protocol.handle(IMAGE_ASSET_PROTOCOL, async (request) => {
      try {
        const url = new URL(request.url)
        const assetId = url.pathname.slice(1)
        if (url.hostname !== 'snapshot' || !ASSET_ID.test(assetId))
          return new Response('Not Found', { status: 404 })
        const content = await this.read(assetId)
        const { mimeType } = identifyImage(content)
        return new Response(new Uint8Array(content), {
          headers: {
            'content-type': mimeType,
            'cache-control': 'private, max-age=31536000, immutable',
          },
        })
      } catch {
        return new Response('Not Found', { status: 404 })
      }
    })
  }
}

export const imageAssetService = new ImageAssetService()
