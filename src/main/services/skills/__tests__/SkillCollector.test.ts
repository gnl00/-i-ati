import { afterEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import os from 'os'
import * as fs from 'fs/promises'
import { extractArchive, fetchUrlToFile } from '../SkillCollector'

const execFileMock = vi.hoisted(() =>
  vi.fn((
    _command: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout?: string) => void
  ) => {
    callback(null, '')
  })
)

vi.mock('child_process', () => ({
  execFile: execFileMock
}))

describe('SkillCollector', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('applies a timeout to archive commands', async () => {
    await extractArchive('/tmp/archive.tar', '/tmp/output', 'tar')

    expect(execFileMock).toHaveBeenCalledTimes(2)
    expect(execFileMock.mock.calls[0][2]).toMatchObject({
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000
    })
    expect(execFileMock.mock.calls[1][2]).toMatchObject({
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000
    })
  })

  it('downloads URL content with an abort signal', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-collector-test-'))
    const destPath = path.join(tempDir, 'skill.zip')
    let fetchInit: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      fetchInit = init
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([97, 98, 99]).buffer
      } as Response
    }))

    try {
      await fetchUrlToFile('https://example.com/skill.zip', destPath)

      await expect(fs.readFile(destPath, 'utf-8')).resolves.toBe('abc')
      expect(fetchInit?.signal).toBeInstanceOf(AbortSignal)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('reports URL fetch timeouts clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }))

    await expect(
      fetchUrlToFile('https://example.com/slow.zip', '/tmp/slow.zip', 5)
    ).rejects.toThrow('Fetch timed out after 5ms')
  })
})
