import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  handle: vi.fn(),
  resolve: vi.fn(),
  decode: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
  net: { fetch: mocks.fetch },
  protocol: { handle: mocks.handle },
  nativeImage: { createFromBuffer: mocks.decode },
}))
vi.mock('@main/services/filesystem/WorkspacePathResolver', () => ({
  resolveWorkspacePath: mocks.resolve,
}))
import { ImageAssetService } from '../ImageAssetService'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFR8AAAAASUVORK5CYII=',
  'base64',
)

describe('image snapshots', () => {
  let root: string
  let service: ImageAssetService
  beforeEach(async () => {
    vi.clearAllMocks()
    root = await mkdtemp(join(tmpdir(), 'image-show-test-'))
    service = new ImageAssetService(() => join(root, 'snapshots'))
    mocks.decode.mockReturnValue({
      getSize: () => ({ width: 1, height: 1 }),
      isEmpty: () => false,
    })
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('keeps a stable copy after the source is overwritten, with runtime workspace scope', async () => {
    const file = join(root, 'source.png')
    await writeFile(file, png)
    mocks.resolve.mockReturnValue({ absolutePath: file })
    const result = await service.prepare(
      { file: 'source.png', caption: ' Preview ' },
      'chat-runtime',
    )
    await writeFile(file, 'replaced')
    expect(await service.read(result.image.assetId)).toEqual(png)
    expect(result.caption).toBe('Preview')
    expect(mocks.resolve).toHaveBeenCalledWith('source.png', {
      chatUuid: 'chat-runtime',
      intent: 'existing',
      mode: 'embedded-relative',
    })
  })

  it('downloads a URL once and uses the snapshot for later reads', async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array(png)))
    const result = await service.prepare({
      url: 'https://example.test/picture',
    })
    expect(await service.read(result.image.assetId)).toEqual(png)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(result.image.url).toMatch(
      /^image-asset:\/\/snapshot\/[a-f0-9]{64}\.png$/,
    )
  })

  it.each([
    { file: 'a', url: 'https://example.test/a' },
    {},
    { url: 'file:///secret.png' },
    { url: 'https://name:secret@example.test/a' },
    { file: 'a', caption: 'x'.repeat(1025) },
  ])('rejects invalid inputs before file/network access: %j', async (args) => {
    await expect(service.prepare(args)).rejects.toThrow()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.resolve).not.toHaveBeenCalled()
  })

  it('supports original GIF and WebP bytes without Electron native decoding', async () => {
    const gif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    )
    const webp = await readFile(
      join(process.cwd(), 'resources/emotions/packs/default/disgust/1.webp'),
    )
    for (const [mimeType, bytes] of [
      ['image/gif', gif],
      ['image/webp', webp],
    ] as const) {
      mocks.fetch.mockResolvedValueOnce(new Response(new Uint8Array(bytes)))
      const result = await service.prepare({
        url: 'https://example.test/image',
      })
      expect(result.image.mimeType).toBe(mimeType)
      expect(result.image.width).toBeGreaterThan(0)
      expect(await service.read(result.image.assetId)).toEqual(bytes)
    }
    expect(mocks.decode).not.toHaveBeenCalled()
  })

  it('rejects oversized downloads by declared length or streamed size and cancels the body', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(new Uint8Array(png), {
        headers: { 'content-length': String(50 * 1024 * 1024 + 1) },
      }),
    )
    await expect(
      service.prepare({ url: 'https://example.test/a' }),
    ).rejects.toThrow('50 MB')
    const cancel = vi.fn()
    const chunk = new Uint8Array(26 * 1024 * 1024)
    mocks.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          pull(controller): void {
            controller.enqueue(chunk)
          },
          cancel,
        }),
      ),
    )
    await expect(
      service.prepare({ url: 'https://example.test/a' }),
    ).rejects.toThrow('50 MB')
    expect(cancel).toHaveBeenCalled()
    expect(mocks.decode).not.toHaveBeenCalled()
  })

  it('rejects HTTP errors, HTML disguised as an image, and decode failures', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(
      service.prepare({ url: 'https://example.test/a' }),
    ).rejects.toThrow('download')
    mocks.fetch.mockResolvedValueOnce(
      new Response('<html>', { headers: { 'content-type': 'image/png' } }),
    )
    await expect(
      service.prepare({ url: 'https://example.test/a' }),
    ).rejects.toThrow('Unsupported')
    mocks.fetch.mockResolvedValueOnce(new Response(new Uint8Array(png)))
    mocks.decode.mockReturnValueOnce({
      getSize: () => ({ width: 0, height: 0 }),
      isEmpty: () => true,
    })
    await expect(
      service.prepare({ url: 'https://example.test/a' }),
    ).rejects.toThrow('decode')
  })

  it('rejects an oversized file before decoding and respects cancellation', async () => {
    const file = join(root, 'huge.png')
    const { open } = await import('node:fs/promises')
    const handle = await open(file, 'w')
    await handle.truncate(50 * 1024 * 1024 + 1)
    await handle.close()
    mocks.resolve.mockReturnValue({ absolutePath: file })
    await expect(service.prepare({ file: 'huge.png' })).rejects.toThrow('50 MB')
    expect(mocks.decode).not.toHaveBeenCalled()
    await expect(
      service.prepare(
        { url: 'https://example.test/a' },
        undefined,
        AbortSignal.abort(),
      ),
    ).rejects.toThrow()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('serves only snapshot IDs and returns 404 for missing or escaped paths', async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array(png)))
    const result = await service.prepare({ url: 'https://example.test/a' })
    service.registerProtocol()
    const handler = mocks.handle.mock.calls[0][1]
    const response = await handler({ url: result.image.url })
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png)
    expect(response.headers.get('content-type')).toBe('image/png')
    for (const url of [
      'image-asset://other/secret',
      'image-asset://snapshot/%2e%2e%2fsecret',
      `image-asset://snapshot/${'a'.repeat(64)}.png`,
    ]) {
      expect((await handler({ url })).status).toBe(404)
    }
    await expect(service.read('../secret')).rejects.toThrow('Invalid')
    expect(
      await readFile(join(root, 'snapshots', result.image.assetId)),
    ).toEqual(png)
  })
})
