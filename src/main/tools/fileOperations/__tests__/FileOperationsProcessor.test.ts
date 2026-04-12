import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const { getPathMock, getWorkspacePathByUuidMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
  getWorkspacePathByUuidMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock,
    isReady: vi.fn(() => false)
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getWorkspacePathByUuid: getWorkspacePathByUuidMock
  }
}))

import { processGlob, processGrep, processLs, processReadTextFile } from '../FileOperationsProcessor'

describe('FileOperationsProcessor.read_text_file', () => {
  let userDataDir: string

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'ati-read-tool-'))
    getPathMock.mockImplementation((key: string) => {
      if (key === 'userData') return userDataDir
      return userDataDir
    })
    getWorkspacePathByUuidMock.mockReset()
    getWorkspacePathByUuidMock.mockReturnValue(undefined)
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('reads an explicit line range and reports returned bounds', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-1', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['a', 'b', 'c', 'd', 'e'].join('\n'), 'utf-8')

    const result = await processReadTextFile({
      chat_uuid: 'chat-1',
      file_path: 'sample.txt',
      start_line: 2,
      end_line: 4
    })

    expect(result.success).toBe(true)
    expect(result.content).toBe(['b', 'c', 'd'].join('\n'))
    expect(result.returned_start_line).toBe(2)
    expect(result.returned_end_line).toBe(4)
    expect(result.truncated).toBe(false)
  })

  it('reads a centered window around a target line', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-2', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, Array.from({ length: 10 }, (_, index) => `line-${index + 1}`).join('\n'), 'utf-8')

    const result = await processReadTextFile({
      chat_uuid: 'chat-2',
      file_path: 'sample.txt',
      around_line: 6,
      window_size: 5
    })

    expect(result.success).toBe(true)
    expect(result.content).toBe(['line-4', 'line-5', 'line-6', 'line-7', 'line-8'].join('\n'))
    expect(result.returned_start_line).toBe(4)
    expect(result.returned_end_line).toBe(8)
    expect(result.truncated).toBe(true)
  })

  it('defaults to a safe leading window when no range is provided', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-3', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, Array.from({ length: 205 }, (_, index) => `line-${index + 1}`).join('\n'), 'utf-8')

    const result = await processReadTextFile({
      chat_uuid: 'chat-3',
      file_path: 'sample.txt'
    })

    expect(result.success).toBe(true)
    expect(result.returned_start_line).toBe(1)
    expect(result.returned_end_line).toBe(200)
    expect(result.truncated).toBe(true)
    expect(result.content?.split('\n')).toHaveLength(200)
  })

  it('caps oversized explicit ranges to the maximum window size', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-4', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, Array.from({ length: 800 }, (_, index) => `line-${index + 1}`).join('\n'), 'utf-8')

    const result = await processReadTextFile({
      chat_uuid: 'chat-4',
      file_path: 'sample.txt',
      start_line: 50,
      end_line: 700
    })

    expect(result.success).toBe(true)
    expect(result.returned_start_line).toBe(50)
    expect(result.returned_end_line).toBe(549)
    expect(result.truncated).toBe(true)
    expect(result.content?.split('\n')).toHaveLength(500)
  })

  it('greps both files and directories through a single entry point', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-5')
    const filePath = join(rootDir, 'src', 'sample.ts')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['alpha', 'target line', 'omega'].join('\n'), 'utf-8')

    const result = await processGrep({
      chat_uuid: 'chat-5',
      path: 'src',
      pattern: 'target'
    })

    expect(result.success).toBe(true)
    expect(result.target_type).toBe('directory')
    expect(result.matches).toHaveLength(1)
    expect(result.matches?.[0].file_path).toContain('sample.ts')
    expect(result.matches?.[0].line).toBe(2)
  })

  it('matches files through glob patterns', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-6')
    const fileA = join(rootDir, 'src', 'alpha.test.ts')
    const fileB = join(rootDir, 'src', 'beta.ts')
    await mkdir(dirname(fileA), { recursive: true })
    await writeFile(fileA, 'export {}', 'utf-8')
    await writeFile(fileB, 'export {}', 'utf-8')

    const result = await processGlob({
      chat_uuid: 'chat-6',
      path: 'src',
      pattern: '**/*.test.ts'
    })

    expect(result.success).toBe(true)
    expect(result.matches).toHaveLength(1)
    expect(result.matches?.[0].path).toBe('alpha.test.ts')
  })

  it('lists directory details through ls(details=true)', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-7')
    const filePath = join(rootDir, 'docs', 'readme.md')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, '# title', 'utf-8')

    const result = await processLs({
      chat_uuid: 'chat-7',
      path: 'docs',
      details: true
    })

    expect(result.success).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.entries?.[0].name).toBe('readme.md')
    expect(result.entries?.[0].size).toBeGreaterThan(0)
    expect(result.entries?.[0].modified).toBeTruthy()
  })
})
