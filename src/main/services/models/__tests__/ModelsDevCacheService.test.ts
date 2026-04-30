import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp')
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

import { ModelsDevCacheService } from '../ModelsDevCacheService'

const fixedDate = new Date('2026-04-30T10:00:00')

const createModelsDevPayload = (modelId = 'gpt-5') => ({
  openai: {
    id: 'openai',
    name: 'OpenAI',
    models: {
      [modelId]: {
        id: modelId,
        name: 'GPT-5',
        reasoning: true,
        tool_call: true,
        modalities: {
          input: ['text', 'image'],
          output: ['text']
        },
        last_updated: '2026-01-01'
      }
    }
  }
})

describe('ModelsDevCacheService', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'models-dev-cache-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('fetches and writes a daily snapshot', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(createModelsDevPayload())
    }))

    const service = new ModelsDevCacheService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getUserDataPath: () => tempDir,
      now: () => fixedDate
    })

    const response = await service.getModelCapabilities(['gpt-5'])
    const snapshotPath = path.join(tempDir, 'models', '2026-04-30.json')
    const saved = JSON.parse(await readFile(snapshotPath, 'utf-8'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(saved.openai.models['gpt-5'].id).toBe('gpt-5')
    expect(response.models['gpt-5']).toEqual(expect.objectContaining({
      modalities: ['text', 'image', 'tool', 'reason'],
      capabilities: ['tool', 'reasoning'],
      sourceDate: '2026-04-30'
    }))
  })

  it('uses the current day snapshot when present', async () => {
    await mkdir(path.join(tempDir, 'models'), { recursive: true })
    await writeFile(
      path.join(tempDir, 'models', '2026-04-30.json'),
      JSON.stringify(createModelsDevPayload('claude-haiku-4-5')),
      'utf-8'
    )

    const fetchMock = vi.fn()
    const service = new ModelsDevCacheService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getUserDataPath: () => tempDir,
      now: () => fixedDate
    })

    const response = await service.getModelCapabilities(['claude-haiku-4-5'])

    expect(fetchMock).toHaveBeenCalledTimes(0)
    expect(response.models['claude-haiku-4-5']).toEqual(expect.objectContaining({
      modelId: 'claude-haiku-4-5',
      sourceDate: '2026-04-30'
    }))
  })

  it('falls back to the latest local snapshot when fetch fails', async () => {
    await mkdir(path.join(tempDir, 'models'), { recursive: true })
    await writeFile(
      path.join(tempDir, 'models', '2026-04-28.json'),
      JSON.stringify(createModelsDevPayload('fallback-model')),
      'utf-8'
    )

    const fetchMock = vi.fn(async () => {
      throw new Error('network failed')
    })
    const service = new ModelsDevCacheService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getUserDataPath: () => tempDir,
      now: () => fixedDate
    })

    const response = await service.getModelCapabilities(['fallback-model'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(response.models['fallback-model']).toEqual(expect.objectContaining({
      modelId: 'fallback-model',
      sourceDate: '2026-04-28'
    }))
  })
})
