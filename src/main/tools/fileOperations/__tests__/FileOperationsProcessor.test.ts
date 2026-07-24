import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const { getPathMock, getWorkspacePathByUuidMock, runRipgrepSearchMock, runRipgrepFileListMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
  getWorkspacePathByUuidMock: vi.fn(),
  runRipgrepSearchMock: vi.fn(),
  runRipgrepFileListMock: vi.fn()
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

vi.mock('../RipgrepRunner', () => ({
  runRipgrepSearch: runRipgrepSearchMock,
  runRipgrepFileList: runRipgrepFileListMock
}))

import {
  processEdit,
  processEditFile,
  processGlob,
  processGrep,
  processListAllowedDirectories,
  processLs,
  processMv,
  processRead,
  processReadTextFile,
  processTree,
  processWrite
} from '../FileOperationsProcessor'

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
    runRipgrepSearchMock.mockReset()
    runRipgrepSearchMock.mockRejectedValue(new Error('rg missing'))
    runRipgrepFileListMock.mockReset()
    runRipgrepFileListMock.mockRejectedValue(new Error('rg missing'))
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

  it('continues a single long UTF-8 line by column without repeating or skipping characters', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-long-line', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    const expected = '中文🙂'.repeat(20_000)
    await writeFile(filePath, expected, 'utf-8')

    let startLine = 1
    let startColumn = 1
    let reconstructed = ''
    let calls = 0
    for (;;) {
      const result = await processReadTextFile({
        chat_uuid: 'chat-long-line',
        file_path: 'sample.txt',
        start_line: startLine,
        start_column: startColumn,
        end_line: 1
      })
      expect(result.success).toBe(true)
      expect(result.content!.length).toBeLessThanOrEqual(32_000)
      reconstructed += result.content
      calls++
      if (!result.truncated) break
      startLine = result.next_start_line!
      startColumn = result.next_start_column!
    }

    expect(calls).toBeGreaterThan(1)
    expect(reconstructed).toBe(expected)
  })

  it('keeps the selected end-line metadata when the read window ends with a blank line', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-trailing-line', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, 'first line\n', 'utf-8')

    const result = await processReadTextFile({
      chat_uuid: 'chat-trailing-line',
      file_path: 'sample.txt',
      start_line: 1,
      end_line: 2
    })

    expect(result).toMatchObject({
      success: true,
      content: 'first line\n',
      returned_end_line: 2,
      returned_end_column: 0,
      truncated: false
    })
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

  it('uses ripgrep for grep when available', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-rg-grep')
    await mkdir(join(rootDir, 'src'), { recursive: true })
    runRipgrepSearchMock.mockResolvedValue({
      matches: [{
        file_path: join(rootDir, 'src', 'sample.ts'),
        line: 3,
        content: 'target line',
        column: 1
      }],
      total_matches: 1,
      files_searched: 1
    })

    const result = await processGrep({
      chat_uuid: 'chat-rg-grep',
      path: 'src',
      pattern: 'target',
      regex: false,
      case_sensitive: false,
      max_results: 5
    })

    expect(result.success).toBe(true)
    expect(result.target_type).toBe('directory')
    expect(result.matches).toEqual([{
      file_path: 'src/sample.ts',
      line: 3,
      content: 'target line',
      column: 1
    }])
    expect(runRipgrepSearchMock).toHaveBeenCalledWith({
      targetPath: join(rootDir, 'src'),
      targetType: 'directory',
      pattern: 'target',
      regex: false,
      caseSensitive: false,
      maxResults: 5,
      filePattern: undefined
    })
  })

  it('uses regex mode by default for grep patterns', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-5a')
    const filePath = join(rootDir, 'src', 'events.ts')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['const source = RUN_EVENT', "emitter.emit('run:event')"].join('\n'), 'utf-8')

    const result = await processGrep({
      chat_uuid: 'chat-5a',
      path: 'src',
      pattern: 'RUN_EVENT|run:event'
    })

    expect(result.success).toBe(true)
    expect(result.matches).toHaveLength(2)
    expect(result.matches?.map((match) => match.line)).toEqual([1, 2])
  })

  it('supports literal grep search when regex is false', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-5b')
    const filePath = join(rootDir, 'src', 'events.ts')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['const source = RUN_EVENT', 'const literal = RUN_EVENT|run:event'].join('\n'), 'utf-8')

    const result = await processGrep({
      chat_uuid: 'chat-5b',
      path: 'src',
      pattern: 'RUN_EVENT|run:event',
      regex: false
    })

    expect(result.success).toBe(true)
    expect(result.matches).toHaveLength(1)
    expect(result.matches?.[0].line).toBe(2)
  })

  it('rejects grep paths outside the workspace', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-5c')
    await mkdir(rootDir, { recursive: true })

    const result = await processGrep({
      chat_uuid: 'chat-5c',
      path: '/',
      pattern: 'sandbox',
      case_sensitive: false,
      max_results: 50
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('PATH_ABSOLUTE_REJECTED')
    expect(runRipgrepSearchMock).not.toHaveBeenCalled()
  })

  it('falls back to JavaScript grep when ripgrep is missing', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-rg-fallback')
    const filePath = join(rootDir, 'src', 'fallback.ts')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['alpha', 'fallback target'].join('\n'), 'utf-8')

    const result = await processGrep({
      chat_uuid: 'chat-rg-fallback',
      path: 'src',
      pattern: 'fallback'
    })

    expect(result.success).toBe(true)
    expect(result.matches).toHaveLength(1)
    expect(result.matches?.[0].file_path).toContain('fallback.ts')
    expect(runRipgrepSearchMock).toHaveBeenCalledTimes(1)
  })

  it('skips ignored directories during JavaScript grep fallback', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-grep-ignore')
    const sourceFile = join(rootDir, 'src', 'app.ts')
    const ignoredFiles = [
      join(rootDir, 'node_modules', 'pkg', 'index.ts'),
      join(rootDir, '.git', 'objects', 'index.ts'),
      join(rootDir, 'dist', 'bundle.ts'),
      join(rootDir, '.xcode-derived', 'generated.ts')
    ]
    await mkdir(dirname(sourceFile), { recursive: true })
    await writeFile(sourceFile, 'export const app = true', 'utf-8')
    for (const filePath of ignoredFiles) {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, 'ignored target', 'utf-8')
    }

    const result = await processGrep({
      chat_uuid: 'chat-grep-ignore',
      path: '.',
      pattern: 'target'
    })

    expect(result.success).toBe(true)
    expect(result.matches).toHaveLength(0)
    expect(result.files_searched).toBe(1)
  })

  it('filters file_pattern before JavaScript grep fallback reads files', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-grep-file-pattern-fallback')
    const matchingFile = join(rootDir, 'src', 'target.test.ts')
    const skippedFile = join(rootDir, 'src', 'target.ts')
    await mkdir(dirname(matchingFile), { recursive: true })
    await writeFile(matchingFile, 'target from test file', 'utf-8')
    await writeFile(skippedFile, 'target from regular file', 'utf-8')

    const result = await processGrep({
      chat_uuid: 'chat-grep-file-pattern-fallback',
      path: 'src',
      pattern: 'target',
      file_pattern: '\\.test\\.ts$'
    })

    expect(result.success).toBe(true)
    expect(result.matches).toHaveLength(1)
    expect(result.matches?.[0].file_path).toContain('target.test.ts')
    expect(result.files_searched).toBe(1)
  })

  it('passes file_pattern to ripgrep using basename semantics', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-rg-file-pattern')
    await mkdir(join(rootDir, 'src'), { recursive: true })
    runRipgrepSearchMock.mockResolvedValue({
      matches: [{
        file_path: join(rootDir, 'src', 'target.test.ts'),
        line: 1,
        content: 'target',
        column: 1
      }],
      total_matches: 1,
      files_searched: 2
    })

    const result = await processGrep({
      chat_uuid: 'chat-rg-file-pattern',
      path: 'src',
      pattern: 'target',
      file_pattern: '\\.test\\.ts$'
    })

    expect(result.success).toBe(true)
    expect(result.matches?.[0].file_path).toContain('target.test.ts')
    expect(runRipgrepSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      filePattern: '\\.test\\.ts$'
    }))
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
    expect(result.matches?.[0].path).toBe('src/alpha.test.ts')
  })

  it('skips ignored directories during JavaScript glob fallback', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-glob-ignore')
    const visibleFile = join(rootDir, 'src', 'alpha.test.ts')
    const ignoredFiles = [
      join(rootDir, 'node_modules', 'pkg', 'hidden.test.ts'),
      join(rootDir, 'build', 'hidden.test.ts'),
      join(rootDir, '.xcode-cache', 'hidden.test.ts')
    ]
    await mkdir(dirname(visibleFile), { recursive: true })
    await writeFile(visibleFile, 'export {}', 'utf-8')
    for (const filePath of ignoredFiles) {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, 'export {}', 'utf-8')
    }

    const result = await processGlob({
      chat_uuid: 'chat-glob-ignore',
      path: '.',
      pattern: '**/*.test.ts'
    })

    expect(result.success).toBe(true)
    expect(result.matches).toEqual([{
      path: 'src/alpha.test.ts',
      name: 'alpha.test.ts',
      type: 'file'
    }])
  })

  it('uses ripgrep for glob file matches and preserves directory matches', async () => {
    const rootDir = join(userDataDir, 'workspaces', 'chat-rg-glob')
    const directoryPath = join(rootDir, 'src', 'cases.test.ts')
    await mkdir(directoryPath, { recursive: true })
    runRipgrepFileListMock.mockResolvedValue({
      files: ['alpha.test.ts']
    })

    const result = await processGlob({
      chat_uuid: 'chat-rg-glob',
      path: 'src',
      pattern: '**/*.test.ts',
      max_results: 10
    })

    expect(result.success).toBe(true)
    expect(result.matches).toEqual(expect.arrayContaining([
      { path: 'src/alpha.test.ts', name: 'alpha.test.ts', type: 'file' },
      { path: 'src/cases.test.ts', name: 'cases.test.ts', type: 'directory' }
    ]))
    expect(runRipgrepFileListMock).toHaveBeenCalledWith({
      rootPath: join(rootDir, 'src'),
      pattern: '**/*.test.ts',
      maxResults: 10
    })
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

describe('FileOperationsProcessor.edit_file', () => {
  let userDataDir: string

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'ati-edit-tool-'))
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

  it('replaces a unique exact match', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-edit-1', 'sample.md')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['alpha', 'target line', 'omega'].join('\n'), 'utf-8')

    const result = await processEditFile({
      chat_uuid: 'chat-edit-1',
      file_path: 'sample.md',
      search: 'target line',
      replace: 'updated line'
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('replaced')
    expect(result.replacements).toBe(1)
    expect(result.diagnostics?.matches?.[0]).toMatchObject({
      line: 2,
      column: 1,
      preview: 'target line'
    })
    await expect(readFile(filePath, 'utf-8')).resolves.toBe(['alpha', 'updated line', 'omega'].join('\n'))
  })

  it('returns unicode diagnostics when no exact match is found', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-edit-2', 'sample.md')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, '# Agent Genesis － 生存系统\n', 'utf-8')

    const result = await processEditFile({
      chat_uuid: 'chat-edit-2',
      file_path: 'sample.md',
      search: '# Agent Genesis — 生存系统',
      replace: '# Agent Genesis - 生存系统'
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('no_match')
    expect(result.replacements).toBe(0)
    expect(result.diagnostics?.nearest_matches?.[0]).toMatchObject({
      line: 1,
      normalized_match: 'dash_equivalent'
    })
    expect(result.diagnostics?.nearest_matches?.[0].differences).toContainEqual({
      index: 16,
      expected: '—',
      expected_codepoint: 'U+2014',
      actual: '－',
      actual_codepoint: 'U+FF0D'
    })
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('# Agent Genesis － 生存系统\n')
  })

  it('blocks ambiguous single replacements and reports match locations', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-edit-3', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['token', 'middle', 'token'].join('\n'), 'utf-8')

    const result = await processEditFile({
      chat_uuid: 'chat-edit-3',
      file_path: 'sample.txt',
      search: 'token',
      replace: 'value'
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('multiple_matches')
    expect(result.diagnostics?.matches).toEqual([
      { line: 1, column: 1, preview: 'token' },
      { line: 3, column: 1, preview: 'token' }
    ])
    await expect(readFile(filePath, 'utf-8')).resolves.toBe(['token', 'middle', 'token'].join('\n'))
  })

  it('keeps all=true for intentional bulk replacement', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-edit-4', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['token', 'middle', 'token'].join('\n'), 'utf-8')

    const result = await processEditFile({
      chat_uuid: 'chat-edit-4',
      file_path: 'sample.txt',
      search: 'token',
      replace: 'value',
      all: true,
      expected_replacements: 2
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('replaced')
    expect(result.replacements).toBe(2)
    await expect(readFile(filePath, 'utf-8')).resolves.toBe(['value', 'middle', 'value'].join('\n'))
  })

  it('reports dry run matches without writing the file', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-edit-5', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, 'alpha beta', 'utf-8')

    const result = await processEditFile({
      chat_uuid: 'chat-edit-5',
      file_path: 'sample.txt',
      search: 'beta',
      replace: 'gamma',
      dry_run: true
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('dry_run')
    expect(result.replacements).toBe(1)
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('alpha beta')
  })

  it('limits matching to an explicit line range', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-edit-6', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['token', 'middle token', 'token'].join('\n'), 'utf-8')

    const result = await processEditFile({
      chat_uuid: 'chat-edit-6',
      file_path: 'sample.txt',
      search: 'token',
      replace: 'value',
      start_line: 2,
      end_line: 2
    })

    expect(result.success).toBe(true)
    expect(result.replacements).toBe(1)
    expect(result.diagnostics?.matches).toEqual([
      { line: 2, column: 8, preview: 'middle token' }
    ])
    await expect(readFile(filePath, 'utf-8')).resolves.toBe(['token', 'middle value', 'token'].join('\n'))
  })

  it('blocks writes when expected_replacements does not match', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-edit-7', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, ['token', 'token'].join('\n'), 'utf-8')

    const result = await processEditFile({
      chat_uuid: 'chat-edit-7',
      file_path: 'sample.txt',
      search: 'token',
      replace: 'value',
      all: true,
      expected_replacements: 1
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('match_count_mismatch')
    expect(result.diagnostics?.matches).toHaveLength(2)
    await expect(readFile(filePath, 'utf-8')).resolves.toBe(['token', 'token'].join('\n'))
  })
})

describe('FileOperationsProcessor workspace confinement', () => {
  let userDataDir: string
  let workspaceRoot: string
  let outsideRoot: string

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'ati-file-safety-'))
    workspaceRoot = join(userDataDir, 'workspaces', 'safe-chat')
    outsideRoot = join(userDataDir, 'outside')
    await mkdir(workspaceRoot, { recursive: true })
    await mkdir(outsideRoot, { recursive: true })
    getPathMock.mockReturnValue(userDataDir)
    getWorkspacePathByUuidMock.mockReset()
    getWorkspacePathByUuidMock.mockReturnValue(undefined)
    runRipgrepSearchMock.mockReset()
    runRipgrepSearchMock.mockRejectedValue(new Error('rg missing'))
    runRipgrepFileListMock.mockReset()
    runRipgrepFileListMock.mockRejectedValue(new Error('rg missing'))
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('enforces the embedded relative contract and preserves legacy IPC absolute paths', async () => {
    const filePath = join(workspaceRoot, 'nested', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, 'safe', 'utf-8')

    const embeddedAbsolute = await processRead({ chat_uuid: 'safe-chat', file_path: filePath })
    expect(embeddedAbsolute).toMatchObject({ success: false })
    expect(embeddedAbsolute.error).toContain('PATH_ABSOLUTE_REJECTED')

    const embeddedMixedSeparators = await processRead({
      chat_uuid: 'safe-chat',
      file_path: 'nested\\sample.txt'
    })
    expect(embeddedMixedSeparators).toMatchObject({ success: true, content: 'safe' })
    expect(embeddedMixedSeparators.file_path).toBe('nested/sample.txt')

    const legacyAbsolute = await processReadTextFile({ chat_uuid: 'safe-chat', file_path: filePath })
    expect(legacyAbsolute).toMatchObject({ success: true, content: 'safe' })
  })

  it('lists symlinks and stops tree, glob, and grep fallback traversal', async () => {
    const secretFile = join(outsideRoot, 'secret.txt')
    await writeFile(secretFile, 'outside target', 'utf-8')
    await symlink(outsideRoot, join(workspaceRoot, 'external'))
    await symlink(workspaceRoot, join(workspaceRoot, 'cycle'))
    await writeFile(join(workspaceRoot, 'visible.txt'), 'inside target', 'utf-8')

    const listing = await processLs({ chat_uuid: 'safe-chat', path: '.' })
    expect(listing.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'external', type: 'symlink', path: 'external' }),
      expect.objectContaining({ name: 'cycle', type: 'symlink', path: 'cycle' })
    ]))

    const tree = await processTree({ chat_uuid: 'safe-chat', path: '.', max_depth: 10 })
    expect(tree.success).toBe(true)
    expect(tree.tree?.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'external', type: 'symlink' }),
      expect.objectContaining({ name: 'cycle', type: 'symlink' })
    ]))
    expect(tree.tree?.children?.find(child => child.name === 'external')).not.toHaveProperty('children')
    expect(tree.tree?.children?.find(child => child.name === 'cycle')).not.toHaveProperty('children')

    const glob = await processGlob({ chat_uuid: 'safe-chat', path: '.', pattern: '**/*.txt' })
    expect(glob.matches).toEqual([expect.objectContaining({ path: 'visible.txt' })])

    const grep = await processGrep({ chat_uuid: 'safe-chat', path: '.', pattern: 'target' })
    expect(grep.matches?.map(match => match.file_path)).toEqual(['visible.txt'])
    expect(grep.matches?.some(match => match.content.includes('outside'))).toBe(false)
  })

  it('revalidates ripgrep-emitted paths before returning matches', async () => {
    const outsideFile = join(outsideRoot, 'secret.txt')
    await writeFile(outsideFile, 'outside target', 'utf-8')
    runRipgrepSearchMock.mockResolvedValue({
      matches: [{ file_path: outsideFile, line: 1, content: 'outside target', column: 1 }],
      total_matches: 1,
      files_searched: 1
    })

    const result = await processGrep({ chat_uuid: 'safe-chat', path: '.', pattern: 'target' })
    expect(result.success).toBe(true)
    expect(result.matches).toEqual([])
  })

  it('keeps ripgrep-emitted paths inside the requested traversal root', async () => {
    const sourceDir = join(workspaceRoot, 'src')
    const siblingFile = join(workspaceRoot, 'sibling.txt')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'inside.txt'), 'inside only', 'utf-8')
    await writeFile(siblingFile, 'target in sibling', 'utf-8')
    runRipgrepSearchMock.mockResolvedValue({
      matches: [{ file_path: siblingFile, line: 1, content: 'target in sibling', column: 1 }],
      total_matches: 1,
      files_searched: 1
    })

    const directoryResult = await processGrep({
      chat_uuid: 'safe-chat', path: 'src', pattern: 'target'
    })
    expect(directoryResult.success).toBe(true)
    expect(directoryResult.matches).toEqual([])

    runRipgrepSearchMock.mockResolvedValue({
      matches: [{ file_path: siblingFile, line: 1, content: 'target in sibling', column: 1 }],
      total_matches: 1,
      files_searched: 1
    })
    const fileResult = await processGrep({
      chat_uuid: 'safe-chat', path: 'src/inside.txt', pattern: 'target'
    })
    expect(fileResult.success).toBe(true)
    expect(fileResult.matches).toEqual([])

    runRipgrepFileListMock.mockResolvedValue({ files: ['../sibling.txt'] })
    const globResult = await processGlob({
      chat_uuid: 'safe-chat', path: 'src', pattern: '**/*.txt'
    })
    expect(globResult.success).toBe(true)
    expect(globResult.matches?.map(match => match.path)).toEqual(['src/inside.txt'])
  })

  it('normalizes embedded mutation response paths', async () => {
    const writeResult = await processWrite({
      chat_uuid: 'safe-chat', file_path: 'nested\\draft.txt', content: 'draft'
    })
    expect(writeResult).toMatchObject({ success: true, file_path: 'nested/draft.txt' })

    const editResult = await processEdit({
      chat_uuid: 'safe-chat',
      file_path: 'nested\\draft.txt',
      search: 'draft',
      replace: 'ready'
    })
    expect(editResult).toMatchObject({ success: true, file_path: 'nested/draft.txt' })

    const moveResult = await processMv({
      chat_uuid: 'safe-chat',
      source_path: 'nested\\draft.txt',
      destination_path: 'nested\\final.txt'
    })
    expect(moveResult).toMatchObject({
      success: true,
      source_path: 'nested/draft.txt',
      destination_path: 'nested/final.txt'
    })
  })

  it('keeps outside content unchanged across write, edit, and move attempts', async () => {
    const outsideFile = join(outsideRoot, 'secret.txt')
    const sourceFile = join(workspaceRoot, 'source.txt')
    await writeFile(outsideFile, 'original', 'utf-8')
    await writeFile(sourceFile, 'source', 'utf-8')
    await symlink(outsideRoot, join(workspaceRoot, 'external'))
    await symlink(outsideFile, join(workspaceRoot, 'external-file'))

    const writeResult = await processWrite({
      chat_uuid: 'safe-chat', file_path: 'external/new.txt', content: 'changed'
    })
    const editResult = await processEdit({
      chat_uuid: 'safe-chat', file_path: 'external-file', search: 'original', replace: 'changed'
    })
    const moveResult = await processMv({
      chat_uuid: 'safe-chat', source_path: 'source.txt', destination_path: 'external-file', overwrite: true
    })

    expect(writeResult.success).toBe(false)
    expect(editResult.success).toBe(false)
    expect(moveResult.success).toBe(false)
    await expect(readFile(outsideFile, 'utf-8')).resolves.toBe('original')
    await expect(readFile(sourceFile, 'utf-8')).resolves.toBe('source')
  })

  it('validates the write backup destination before copying', async () => {
    const sourceFile = join(workspaceRoot, 'safe.txt')
    const outsideFile = join(outsideRoot, 'backup-target.txt')
    await writeFile(sourceFile, 'workspace original', 'utf-8')
    await writeFile(outsideFile, 'outside original', 'utf-8')
    await symlink(outsideFile, `${sourceFile}.backup`)

    const result = await processWrite({
      chat_uuid: 'safe-chat',
      file_path: 'safe.txt',
      content: 'workspace changed',
      backup: true
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('PATH_SYMLINK_ESCAPE')
    await expect(readFile(sourceFile, 'utf-8')).resolves.toBe('workspace original')
    await expect(readFile(outsideFile, 'utf-8')).resolves.toBe('outside original')
  })

  it('reports the effective workspace root as the allowed directory', async () => {
    const result = await processListAllowedDirectories({ chat_uuid: 'safe-chat' })
    expect(result).toMatchObject({ success: true })
    expect(result.directories).toHaveLength(1)
    expect(result.directories?.[0]).toContain('/workspaces/safe-chat')
  })
})
