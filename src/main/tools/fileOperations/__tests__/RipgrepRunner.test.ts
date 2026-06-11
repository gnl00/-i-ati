import { EventEmitter } from 'events'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock, existsSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  existsSyncMock: vi.fn()
}))

vi.mock('child_process', () => ({
  spawn: spawnMock
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock
}))

import { resolveRipgrepCommand, runRipgrepFileList, runRipgrepSearch } from '../RipgrepRunner'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn(() => {
    this.emit('close', null)
    return true
  })
}

function mockRipgrepProcess(options: { stdout?: string, stderr?: string, code: number }): FakeChildProcess {
  const child = new FakeChildProcess()
  spawnMock.mockImplementationOnce(() => {
    queueMicrotask(() => {
      if (options.stdout) {
        child.stdout.emit('data', Buffer.from(options.stdout, 'utf-8'))
      }
      if (options.stderr) {
        child.stderr.emit('data', Buffer.from(options.stderr, 'utf-8'))
      }
      child.emit('close', options.code)
    })
    return child
  })
  return child
}

describe('RipgrepRunner', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    existsSyncMock.mockReset()
    existsSyncMock.mockReturnValue(false)
  })

  it('resolves embedded packaged ripgrep binaries before PATH lookup', () => {
    const originalResourcesPath = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', {
      value: '/packaged',
      configurable: true
    })
    const executable = process.platform === 'win32' ? 'rg.exe' : 'rg'
    const expectedPath = join('/packaged', 'native', 'ripgrep', `${process.platform}-${process.arch}`, executable)
    existsSyncMock.mockImplementation((value: string) => value === expectedPath)

    try {
      expect(resolveRipgrepCommand()).toBe(expectedPath)
    } finally {
      Object.defineProperty(process, 'resourcesPath', {
        value: originalResourcesPath,
        configurable: true
      })
    }
  })

  it('parses ripgrep JSON matches and applies basename file patterns', async () => {
    const ignoredEvent = {
      type: 'match',
      data: {
        path: { text: 'src/ignored.ts' },
        lines: { text: 'target ignored\n' },
        line_number: 1,
        submatches: [{ start: 7 }]
      }
    }
    const targetEvent = {
      type: 'match',
      data: {
        path: { text: 'src/target.test.ts' },
        lines: { text: 'target kept\n' },
        line_number: 2,
        submatches: [{ start: 0 }]
      }
    }
    const summaryEvent = {
      type: 'summary',
      data: {
        stats: {
          searches: 4
        }
      }
    }

    mockRipgrepProcess({
      stdout: `${JSON.stringify(ignoredEvent)}\n${JSON.stringify(targetEvent)}\n${JSON.stringify(summaryEvent)}\n`,
      code: 0
    })

    const result = await runRipgrepSearch({
      targetPath: '/workspace',
      targetType: 'directory',
      pattern: 'target',
      regex: true,
      caseSensitive: true,
      maxResults: 10,
      filePattern: '\\.test\\.ts$'
    })

    expect(result).toEqual({
      matches: [{
        file_path: '/workspace/src/target.test.ts',
        line: 2,
        content: 'target kept',
        column: 1
      }],
      total_matches: 1,
      files_searched: 4
    })
    expect(spawnMock).toHaveBeenCalledWith('rg', expect.arrayContaining([
      '--json',
      '--no-ignore',
      '!node_modules/**',
      '!**/.xcode-*/**',
      '--',
      'target',
      '.'
    ]), expect.objectContaining({ cwd: '/workspace' }))
  })

  it('treats ripgrep exit code 1 as an empty successful search', async () => {
    mockRipgrepProcess({ code: 1 })

    const result = await runRipgrepSearch({
      targetPath: '/workspace/src/sample.ts',
      targetType: 'file',
      pattern: 'missing',
      regex: false,
      caseSensitive: false,
      maxResults: 10
    })

    expect(result).toEqual({
      matches: [],
      total_matches: 0,
      files_searched: 0
    })
    expect(spawnMock).toHaveBeenCalledWith('rg', expect.arrayContaining([
      '-F',
      '-i',
      'missing',
      'sample.ts'
    ]), expect.objectContaining({ cwd: '/workspace/src' }))
  })

  it('parses ripgrep file lists for glob fast paths', async () => {
    mockRipgrepProcess({
      stdout: './src/alpha.test.ts\nsrc/beta.test.ts\n',
      code: 0
    })

    const result = await runRipgrepFileList({
      rootPath: '/workspace',
      pattern: '**/*.test.ts',
      maxResults: 10
    })

    expect(result).toEqual({
      files: ['src/alpha.test.ts', 'src/beta.test.ts']
    })
    expect(spawnMock).toHaveBeenCalledWith('rg', expect.arrayContaining([
      '--files',
      '--glob',
      '!node_modules/**',
      '!**/.xcode-*/**',
      '--glob',
      '**/*.test.ts',
      '.'
    ]), expect.objectContaining({ cwd: '/workspace' }))
  })
})
