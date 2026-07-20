import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/app'),
    isReady: vi.fn(() => true)
  },
  shell: {},
  BrowserWindow: vi.fn(),
  session: {},
  ipcMain: {}
}))

vi.mock('@main/main-window', () => ({
  getMainWindow: vi.fn(() => null)
}))

import { VisionToolsProcessor } from '../VisionToolsProcessor'

describe('VisionToolsProcessor', () => {
  it('passes prompt through to the vision request unchanged and resolves refs', async () => {
    const analyze = vi.fn(async () => ({
      text: 'The amount is $42.00.',
      model: 'vision-model',
      imageCount: 1
    }))
    const resolveImages = vi.fn(() => [{
      ref: 'message:101#image:1',
      success: true as const,
      images: [{
        ref: 'message:101#image:1',
        url: 'data:image/png;base64,abc'
      }]
    }])
    const processor = new VisionToolsProcessor({
      imageRefResolver: { resolveImages },
      visionRequestService: { analyze }
    })

    const result = await processor.analyze({
      chat_uuid: 'chat-1',
      images: [{ ref: 'message:101#image:1' }],
      prompt: '截图的金额是多少。请读取图片并提取相关金额。'
    })

    expect(resolveImages).toHaveBeenCalledWith([{ ref: 'message:101#image:1' }], 'chat-1')
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      imageUrls: ['data:image/png;base64,abc'],
      prompt: '截图的金额是多少。请读取图片并提取相关金额。',
      timeoutLabel: 'vision analysis',
      timeoutMs: 60000
    }))
    expect(result).toEqual({
      success: true,
      result: 'The amount is $42.00.',
      image_count: 1,
      images: [{
        type: 'ref',
        ref: 'message:101#image:1'
      }],
      message: 'Analyzed 1 image.'
    })
  })

  it('clamps timeout_seconds between 5 and 120 seconds', async () => {
    const analyze = vi.fn(async (_input: any) => ({
      text: 'inspected',
      model: 'vision-model',
      imageCount: 1
    }))
    const resolveImages = vi.fn(() => [{
      ref: 'message:101#image:1',
      success: true as const,
      images: [{
        ref: 'message:101#image:1',
        url: 'data:image/png;base64,abc'
      }]
    }])
    const processor = new VisionToolsProcessor({
      imageRefResolver: { resolveImages },
      visionRequestService: { analyze }
    })

    await processor.analyze({
      images: [{ ref: 'message:101#image:1' }],
      prompt: 'inspect',
      timeout_seconds: 1
    })
    await processor.analyze({
      images: [{ ref: 'message:101#image:1' }],
      prompt: 'inspect',
      timeout_seconds: 999
    })

    expect(analyze.mock.calls[0][0]).toEqual(expect.objectContaining({
      timeoutMs: 5000
    }))
    expect(analyze.mock.calls[1][0]).toEqual(expect.objectContaining({
      timeoutMs: 120000
    }))
  })

  it('supports url and raw_data passthrough in one vision request', async () => {
    const analyze = vi.fn(async () => ({
      text: 'two images inspected',
      model: 'vision-model',
      imageCount: 2
    }))
    const resolveImages = vi.fn(() => [
      {
        ref: 'https://cdn.example/image.png',
        success: true as const,
        images: [{
          ref: 'https://cdn.example/image.png',
          url: 'https://cdn.example/image.png'
        }]
      },
      {
        ref: 'input:2',
        success: true as const,
        images: [{
          ref: 'input:2',
          url: 'data:image/jpeg;base64,raw'
        }]
      }
    ])
    const processor = new VisionToolsProcessor({
      imageRefResolver: { resolveImages },
      visionRequestService: { analyze }
    })

    const result = await processor.analyze({
      chat_uuid: 'chat-1',
      images: [
        { url: 'https://cdn.example/image.png' },
        { raw_data: 'data:image/jpeg;base64,raw' }
      ],
      prompt: 'describe'
    })

    expect(resolveImages).toHaveBeenCalledWith([
      { url: 'https://cdn.example/image.png' },
      { raw_data: 'data:image/jpeg;base64,raw' }
    ], 'chat-1')
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      imageUrls: ['https://cdn.example/image.png', 'data:image/jpeg;base64,raw'],
      prompt: 'describe'
    }))
    expect(result).toMatchObject({
      success: true,
      result: 'two images inspected',
      image_count: 2,
      images: [
        { type: 'url', ref: 'input:1' },
        { type: 'raw_data', ref: 'input:2' }
      ]
    })
  })

  it('normalizes top-level image_refs, urls, and raw_data arrays', async () => {
    const analyze = vi.fn(async () => ({
      text: 'three images inspected',
      model: 'vision-model',
      imageCount: 3
    }))
    const resolveImages = vi.fn(() => [
      {
        ref: 'message:101#image:1',
        success: true as const,
        images: [{
          ref: 'message:101#image:1',
          url: 'data:image/png;base64,ref'
        }]
      },
      {
        ref: 'https://cdn.example/top-level.png',
        success: true as const,
        images: [{
          ref: 'https://cdn.example/top-level.png',
          url: 'https://cdn.example/top-level.png'
        }]
      },
      {
        ref: 'input:3',
        success: true as const,
        images: [{
          ref: 'input:3',
          url: 'data:image/png;base64,raw'
        }]
      }
    ])
    const processor = new VisionToolsProcessor({
      imageRefResolver: { resolveImages },
      visionRequestService: { analyze }
    })

    const result = await processor.analyze({
      chat_uuid: 'chat-1',
      image_refs: ['message:101#image:1'],
      urls: ['https://cdn.example/top-level.png'],
      raw_data: ['data:image/png;base64,raw'],
      prompt: 'compare'
    })

    expect(resolveImages).toHaveBeenCalledWith([
      { ref: 'message:101#image:1' },
      { url: 'https://cdn.example/top-level.png' },
      { raw_data: 'data:image/png;base64,raw' }
    ], 'chat-1')
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      imageUrls: [
        'data:image/png;base64,ref',
        'https://cdn.example/top-level.png',
        'data:image/png;base64,raw'
      ],
      prompt: 'compare'
    }))
    expect(result).toMatchObject({
      success: true,
      image_count: 3
    })
  })

  it('omits signed URL tokens from successful direct URL metadata', async () => {
    const analyze = vi.fn(async () => ({
      text: 'signed image inspected',
      model: 'vision-model',
      imageCount: 1
    }))
    const resolveImages = vi.fn(() => [{
      ref: 'https://cdn.example/image.png?X-Amz-Signature=secret-token',
      success: true as const,
      images: [{
        ref: 'https://cdn.example/image.png?X-Amz-Signature=secret-token',
        url: 'https://cdn.example/image.png?X-Amz-Signature=secret-token'
      }]
    }])
    const processor = new VisionToolsProcessor({
      imageRefResolver: { resolveImages },
      visionRequestService: { analyze }
    })

    const result = await processor.analyze({
      chat_uuid: 'chat-1',
      images: [{ url: 'https://cdn.example/image.png?X-Amz-Signature=secret-token' }],
      prompt: 'describe'
    })

    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      imageUrls: ['https://cdn.example/image.png?X-Amz-Signature=secret-token']
    }))
    expect(result).toMatchObject({
      success: true,
      images: [{ type: 'url', ref: 'input:1' }]
    })
    expect(JSON.stringify(result)).not.toContain('secret-token')
    expect(JSON.stringify(result)).not.toContain('X-Amz-Signature')
  })

  it('passes the images array directly to the resolver', async () => {
    const analyze = vi.fn(async () => ({
      text: 'legacy ref inspected',
      model: 'vision-model',
      imageCount: 1
    }))
    const resolveImages = vi.fn(() => [{
      ref: 'message:101#image:1',
      success: true as const,
      images: [{
        ref: 'message:101#image:1',
        url: 'data:image/png;base64,abc'
      }]
    }])
    const processor = new VisionToolsProcessor({
      imageRefResolver: { resolveImages },
      visionRequestService: { analyze }
    })

    await processor.analyze({
      chat_uuid: 'chat-1',
      images: [{ ref: 'message:101#image:1' }],
      prompt: 'inspect'
    })

    expect(resolveImages).toHaveBeenCalledWith([{ ref: 'message:101#image:1' }], 'chat-1')
  })

  it('returns input validation errors for missing prompt or images', async () => {
    const processor = new VisionToolsProcessor({
      imageRefResolver: { resolveImages: vi.fn() },
      visionRequestService: { analyze: vi.fn() }
    })

    await expect(processor.analyze({
      images: [{ ref: 'message:101#image:1' }],
      prompt: ''
    })).resolves.toMatchObject({
      success: false,
      message: 'prompt is required'
    })
    await expect(processor.analyze({
      images: [],
      prompt: 'read'
    })).resolves.toMatchObject({
      success: false,
      message: 'at least one image ref, url, or raw_data item is required'
    })
  })

  it('returns redacted request errors', async () => {
    const longBase64 = 'a'.repeat(180)
    const processor = new VisionToolsProcessor({
      imageRefResolver: {
        resolveImages: vi.fn(() => [{
          ref: 'message:101#image:1',
          success: true as const,
          images: [{
            ref: 'message:101#image:1',
            url: `data:image/png;base64,${longBase64}`
          }]
        }])
      },
      visionRequestService: {
        analyze: vi.fn(async () => {
          throw new Error(`bad data:image/png;base64,${longBase64} apiKey=secret-token`)
        })
      }
    })

    const result = await processor.analyze({
      chat_uuid: 'chat-1',
      images: [{ ref: 'message:101#image:1' }],
      prompt: 'read'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('[REDACTED]')
    expect(result.message).not.toContain(longBase64)
    expect(result.message).not.toContain('secret-token')
  })
})
