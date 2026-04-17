import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gzip as gzipCallback } from 'zlib'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { promisify } from 'util'

const gzip = promisify(gzipCallback)

const { getPathMock, isReadyMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
  isReadyMock: vi.fn(() => true)
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock,
    isReady: isReadyMock
  }
}))

import { processLogSearch } from '../LogToolsProcessor'

describe('LogToolsProcessor', () => {
  let userDataDir: string
  let logsDir: string

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'ati-log-tool-'))
    logsDir = join(userDataDir, 'logs')
    await mkdir(logsDir, { recursive: true })
    getPathMock.mockImplementation((key: string) => {
      if (key === 'userData') return userDataDir
      return userDataDir
    })
    isReadyMock.mockReturnValue(true)
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('returns the tail of a log file as a single block', async () => {
    const filePath = join(logsDir, 'app-2026-04-17.log')
    await writeFile(filePath, ['line-1', 'line-2', 'line-3', 'line-4', 'line-5'].join('\n'), 'utf-8')

    const result = await processLogSearch({
      target: 'app',
      date: '2026-04-17',
      tail_lines: 2
    })

    expect(result.success).toBe(true)
    expect(result.file_name).toBe('app-2026-04-17.log')
    expect(result.total_lines).toBe(5)
    expect(result.returned_blocks).toBe(1)
    expect(result.truncated).toBe(true)
    expect(result.blocks).toEqual([
      {
        start_line: 4,
        end_line: 5,
        lines: [
          { line: 4, text: 'line-4' },
          { line: 5, text: 'line-5' }
        ]
      }
    ])
  })

  it('defaults to today when date is omitted', async () => {
    const filePath = join(logsDir, 'app-2026-04-17.log')
    await writeFile(filePath, ['today-1', 'today-2'].join('\n'), 'utf-8')

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T08:00:00.000Z'))

    const result = await processLogSearch({
      target: 'app',
      tail_lines: 1
    })

    expect(result.success).toBe(true)
    expect(result.date).toBe('2026-04-17')
    expect(result.file_name).toBe('app-2026-04-17.log')
    expect(result.blocks?.[0].lines).toEqual([
      { line: 2, text: 'today-2' }
    ])
  })

  it('filters by query and scope, then merges overlapping windows into one block', async () => {
    const filePath = join(logsDir, 'app-2026-04-17.log')
    const lines = [
      'boot',
      '{"scope":"MemoryService","msg":"starting"}',
      '{"scope":"MemoryService","msg":"request.failed: first"}',
      'separator',
      '{"scope":"MemoryService","msg":"request.failed: second"}',
      '{"scope":"TelegramIPC","msg":"request.failed: wrong scope"}',
      'tail'
    ]
    await writeFile(filePath, lines.join('\n'), 'utf-8')

    const result = await processLogSearch({
      target: 'app',
      date: '2026-04-17',
      query: 'request.failed',
      scope: 'memory',
      context_before: 1,
      context_after: 1
    })

    expect(result.success).toBe(true)
    expect(result.total_matches).toBe(2)
    expect(result.returned_blocks).toBe(1)
    expect(result.truncated).toBe(false)
    expect(result.blocks).toEqual([
      {
        start_line: 2,
        end_line: 6,
        match_lines: [3, 5],
        lines: [
          { line: 2, text: '{"scope":"MemoryService","msg":"starting"}' },
          { line: 3, text: '{"scope":"MemoryService","msg":"request.failed: first"}' },
          { line: 4, text: 'separator' },
          { line: 5, text: '{"scope":"MemoryService","msg":"request.failed: second"}' },
          { line: 6, text: '{"scope":"TelegramIPC","msg":"request.failed: wrong scope"}' }
        ]
      }
    ])
  })

  it('falls back to archived .log.gz files', async () => {
    const filePath = join(logsDir, 'perf-2026-04-17.log.gz')
    const compressed = await gzip(Buffer.from(['perf-1', 'perf-2', 'perf-3'].join('\n'), 'utf-8'))
    await writeFile(filePath, compressed)

    const result = await processLogSearch({
      target: 'perf',
      date: '2026-04-17',
      query: 'perf-2'
    })

    expect(result.success).toBe(true)
    expect(result.file_name).toBe('perf-2026-04-17.log.gz')
    expect(result.total_matches).toBe(1)
    expect(result.blocks?.[0].match_lines).toEqual([2])
    expect(result.blocks?.[0].lines.some(line => line.text === 'perf-2')).toBe(true)
  })

  it('returns an empty result when no search match is found', async () => {
    const filePath = join(logsDir, 'app-2026-04-17.log')
    await writeFile(filePath, ['alpha', 'beta'].join('\n'), 'utf-8')

    const result = await processLogSearch({
      target: 'app',
      date: '2026-04-17',
      query: 'gamma'
    })

    expect(result.success).toBe(true)
    expect(result.total_matches).toBe(0)
    expect(result.returned_blocks).toBe(0)
    expect(result.truncated).toBe(false)
    expect(result.blocks).toEqual([])
  })

  it('matches scope against raw text when the line is not valid json', async () => {
    const filePath = join(logsDir, 'app-2026-04-17.log')
    await writeFile(filePath, [
      '[MemoryService] boot',
      '[MemoryService] request.failed',
      '[TelegramIPC] request.failed'
    ].join('\n'), 'utf-8')

    const result = await processLogSearch({
      target: 'app',
      date: '2026-04-17',
      scope: 'memoryservice',
      query: 'request.failed'
    })

    expect(result.success).toBe(true)
    expect(result.total_matches).toBe(1)
    expect(result.blocks?.[0].match_lines).toEqual([2])
  })

  it('respects case_sensitive for query and scope filtering', async () => {
    const filePath = join(logsDir, 'app-2026-04-17.log')
    await writeFile(filePath, [
      '{"scope":"MemoryService","msg":"Request.Failed"}',
      '{"scope":"memoryservice","msg":"request.failed"}'
    ].join('\n'), 'utf-8')

    const insensitive = await processLogSearch({
      target: 'app',
      date: '2026-04-17',
      scope: 'memoryservice',
      query: 'request.failed'
    })

    const sensitive = await processLogSearch({
      target: 'app',
      date: '2026-04-17',
      scope: 'memoryservice',
      query: 'request.failed',
      case_sensitive: true
    })

    expect(insensitive.success).toBe(true)
    expect(insensitive.total_matches).toBe(2)
    expect(sensitive.success).toBe(true)
    expect(sensitive.total_matches).toBe(1)
    expect(sensitive.blocks?.[0].match_lines).toEqual([2])
  })

  it('keeps only the latest max_matches before building blocks', async () => {
    const filePath = join(logsDir, 'app-2026-04-17.log')
    await writeFile(filePath, [
      'request.failed one',
      'gap-a',
      'request.failed two',
      'gap-b',
      'request.failed three'
    ].join('\n'), 'utf-8')

    const result = await processLogSearch({
      target: 'app',
      date: '2026-04-17',
      query: 'request.failed',
      context_before: 0,
      context_after: 0,
      max_matches: 2
    })

    expect(result.success).toBe(true)
    expect(result.total_matches).toBe(3)
    expect(result.truncated).toBe(true)
    expect(result.blocks).toEqual([
      {
        start_line: 3,
        end_line: 3,
        match_lines: [3],
        lines: [{ line: 3, text: 'request.failed two' }]
      },
      {
        start_line: 5,
        end_line: 5,
        match_lines: [5],
        lines: [{ line: 5, text: 'request.failed three' }]
      }
    ])
  })

  it('rejects invalid calendar dates', async () => {
    const result = await processLogSearch({
      target: 'app',
      date: '2026-13-40'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('valid YYYY-MM-DD')
  })

  it('returns recent available log files when the requested date is missing', async () => {
    await writeFile(join(logsDir, 'app-2026-04-17.log'), 'a', 'utf-8')
    await writeFile(join(logsDir, 'app-2026-04-16.log.gz'), await gzip(Buffer.from('b', 'utf-8')))
    await writeFile(join(logsDir, 'app-2026-04-15.log.gz'), await gzip(Buffer.from('c', 'utf-8')))
    await writeFile(join(logsDir, 'app-2026-04-14.log.gz'), await gzip(Buffer.from('d', 'utf-8')))
    await writeFile(join(logsDir, 'app-2026-04-13.log.gz'), await gzip(Buffer.from('e', 'utf-8')))
    await writeFile(join(logsDir, 'app-2026-04-12.log.gz'), await gzip(Buffer.from('f', 'utf-8')))
    await writeFile(join(logsDir, 'app-2026-04-11.log.gz'), await gzip(Buffer.from('g', 'utf-8')))
    await writeFile(join(logsDir, 'app-2026-04-10.log.gz'), await gzip(Buffer.from('h', 'utf-8')))
    await writeFile(join(logsDir, 'perf-2026-04-17.log'), 'ignore-other-target', 'utf-8')

    const result = await processLogSearch({
      target: 'app',
      date: '2026-04-18'
    })

    expect(result.success).toBe(false)
    expect(result.available_files).toEqual([
      'app-2026-04-17.log',
      'app-2026-04-16.log.gz',
      'app-2026-04-15.log.gz',
      'app-2026-04-14.log.gz',
      'app-2026-04-13.log.gz',
      'app-2026-04-12.log.gz',
      'app-2026-04-11.log.gz'
    ])
    expect(result.error).toContain('2026-04-18')
  })

  it('keeps recent blocks within the total returned line budget', async () => {
    const filePath = join(logsDir, 'app-2026-04-17.log')
    const lines = Array.from({ length: 1500 }, (_, index) => `line-${index + 1}`)
    const matchLineNumbers = [100, 220, 340, 460, 580, 700, 820, 940, 1060, 1180]
    for (const lineNumber of matchLineNumbers) {
      lines[lineNumber - 1] = `request.failed ${lineNumber}`
    }
    await writeFile(filePath, lines.join('\n'), 'utf-8')

    const result = await processLogSearch({
      target: 'app',
      date: '2026-04-17',
      query: 'request.failed',
      context_before: 50,
      context_after: 50,
      max_matches: 10
    })

    expect(result.success).toBe(true)
    expect(result.truncated).toBe(true)
    expect(result.returned_blocks).toBe(9)
    expect(result.blocks?.[0].match_lines).toEqual([220])
    expect(result.blocks?.[result.blocks.length - 1].match_lines).toEqual([1180])
    expect(result.blocks?.every(block => block.lines.length <= 101)).toBe(true)
  })
})
