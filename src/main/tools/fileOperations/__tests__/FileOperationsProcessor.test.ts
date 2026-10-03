import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'node:crypto'
import type { EditArgs, WriteArgs } from '@shared/tools/fileOperations/index.d'
import { withFileOperation } from '@main/services/filesystem/FileMutationService'

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
  formatReadResultForModel,
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

function fileVersion(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

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
    expect(result.file_version).toBe(fileVersion('a\nb\nc\nd\ne'))
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
    await writeFile(filePath, Array.from({ length: 505 }, (_, index) => `line-${index + 1}`).join('\n'), 'utf-8')

    const result = await processReadTextFile({
      chat_uuid: 'chat-3',
      file_path: 'sample.txt'
    })

    expect(result.success).toBe(true)
    expect(result.returned_start_line).toBe(1)
    expect(result.returned_end_line).toBe(500)
    expect(result.truncated).toBe(true)
    expect(result.content?.split('\n')).toHaveLength(500)
    expect(result.next_start_line).toBe(501)
  })

  it('caps oversized explicit ranges to the maximum window size', async () => {
    const filePath = join(userDataDir, 'workspaces', 'chat-4', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, Array.from({ length: 1800 }, (_, index) => `line-${index + 1}`).join('\n'), 'utf-8')

    const result = await processReadTextFile({
      chat_uuid: 'chat-4',
      file_path: 'sample.txt',
      start_line: 50,
      end_line: 1700
    })

    expect(result.success).toBe(true)
    expect(result.returned_start_line).toBe(50)
    expect(result.returned_end_line).toBe(1549)
    expect(result.truncated).toBe(true)
    expect(result.content?.split('\n')).toHaveLength(1500)
    expect(result.next_start_line).toBe(1550)
  })

  it.each([300, 2000])('bounds a requested %i-line scan and resumes without gaps', async (windowSize) => {
    const filePath = join(userDataDir, 'workspaces', 'chat-scan', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    const lines = Array.from({ length: 1600 }, (_, index) => `line-${index + 1}`)
    await writeFile(filePath, lines.join('\n'), 'utf-8')

    const first = await processReadTextFile({
      chat_uuid: 'chat-scan',
      file_path: 'sample.txt',
      window_size: windowSize
    })
    const expectedSize = Math.min(windowSize, 1500)
    expect(first.content?.split('\n')).toHaveLength(expectedSize)
    expect(first.next_start_line).toBe(expectedSize + 1)
    expect(first.truncated).toBe(true)

    const next = await processReadTextFile({
      chat_uuid: 'chat-scan',
      file_path: 'sample.txt',
      window_size: windowSize,
      start_line: first.next_start_line,
      start_column: first.next_start_column
    })
    expect(next.returned_start_line).toBe(expectedSize + 1)
    expect(next.content?.split('\n')).toEqual(lines.slice(expectedSize, expectedSize * 2))
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
      expect(formatReadResultForModel(result).length).toBeLessThanOrEqual(32_000)
      expect(result.content).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u)
      expect(result.file_version).toBe(fileVersion(expected))
      reconstructed += result.content
      calls++
      if (!result.truncated) break
      startLine = result.next_start_line!
      startColumn = result.next_start_column!
    }

    expect(calls).toBeGreaterThan(1)
    expect(reconstructed).toBe(expected)
  })

  it('keeps data image text available in the bounded model result', async () => {
    const filePath = join(
      userDataDir,
      'workspaces',
      'chat-data-image',
      'sample.txt',
    )
    await mkdir(dirname(filePath), { recursive: true })
    const content = 'data:image/png;base64,AA=='
    await writeFile(filePath, content)
    const result = await processReadTextFile({
      chat_uuid: 'chat-data-image',
      file_path: 'sample.txt',
    })
    expect(result.content).toBe(content)
    expect(formatReadResultForModel(result)).toContain(content)
  })

  it.each([
    ['', 'none', false, ''],
    ['one line', 'none', false, 'one line'],
    ['one\ntwo\n', 'lf', false, 'one\ntwo\n'],
    ['\uFEFFone\r\ntwo\r\n', 'crlf', true, 'one\ntwo\n'],
    ['one\r\ntwo\nthree\r', 'mixed', false, 'one\r\ntwo\nthree\r'],
  ])(
    'reports the raw-byte version and text view for %j',
    async (raw, lineEnding, bom, content) => {
      const filePath = join(
        userDataDir,
        'workspaces',
        'chat-text-view',
        'sample.txt',
      )
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, raw)
      const result = await processReadTextFile({
        chat_uuid: 'chat-text-view',
        file_path: 'sample.txt',
      })
      expect(result).toMatchObject({
        success: true,
        content,
        line_ending: lineEnding,
        bom,
        file_version: fileVersion(raw),
      })
    },
  )

  it.each([
    ['invalid UTF-8', Buffer.from([0xc3, 0x28]), 'FILE_ENCODING_UNSUPPORTED'],
    ['NUL content', Buffer.from('before\0after'), 'FILE_BINARY_UNSUPPORTED'],
  ])(
    'rejects %s rather than returning a lossy text view',
    async (_kind, bytes, expectedCode) => {
      const filePath = join(
        userDataDir,
        'workspaces',
        'chat-invalid-text',
        'sample.txt',
      )
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, bytes)
      const result = await processReadTextFile({
        chat_uuid: 'chat-invalid-text',
        file_path: 'sample.txt',
      })
      expect(result.success).toBe(false)
      expect(result.failure?.code).toBe(expectedCode)
      expect(result.content).toBeUndefined()
      await expect(readFile(filePath)).resolves.toEqual(bytes)
    },
  )

  it.each([
    { start_line: 0 },
    { start_line: 1.5 },
    { start_line: 3 },
    { start_column: 0 },
    { start_column: 4 },
    { start_column: 2 },
    { start_line: 2, end_line: 1 },
    { window_size: 1.5 },
  ])(
    'rejects invalid or surrogate-splitting read coordinates %j',
    async (range) => {
      const filePath = join(
        userDataDir,
        'workspaces',
        'chat-range',
        'sample.txt',
      )
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, '🙂\nsecond')
      const result = await processReadTextFile({
        chat_uuid: 'chat-range',
        file_path: 'sample.txt',
        ...range,
      })
      expect(result.failure?.code).toBe('READ_RANGE_INVALID')
      expect(result.content).toBeUndefined()
    },
  )

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
    expect(result.error).toContain('PATH_OUTSIDE_WORKSPACE')
    expect(result.failure).toMatchObject({
      category: 'policy',
      code: 'PATH_OUTSIDE_WORKSPACE',
      recovery: { action: 'change_strategy' }
    })
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

describe('FileOperationsProcessor versioned mutations', () => {
  let userDataDir: string
  let workspaceRoot: string
  const chatUuid = 'chat-edit'

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'ati-edit-tool-'))
    workspaceRoot = join(userDataDir, 'workspaces', chatUuid)
    await mkdir(workspaceRoot, { recursive: true })
    getPathMock.mockReturnValue(userDataDir)
    getWorkspacePathByUuidMock.mockReset()
    getWorkspacePathByUuidMock.mockReturnValue(undefined)
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  async function seed(content: string | Buffer): Promise<string> {
    await writeFile(join(workspaceRoot, 'sample.txt'), content)
    return fileVersion(content)
  }

  it('shares versions through an internal symlink and edits its target while retaining the link', async () => {
    await seed('original')
    const aliasPath = join(workspaceRoot, 'alias.txt')
    await symlink(join(workspaceRoot, 'sample.txt'), aliasPath)
    const aliasRead = await processRead({ chat_uuid: chatUuid, file_path: 'alias.txt' })
    const targetRead = await processRead({ chat_uuid: chatUuid, file_path: 'sample.txt' })
    expect(aliasRead).toMatchObject({ success: true, content: 'original', file_version: targetRead.file_version })
    const edited = await processEdit({
      chat_uuid: chatUuid,
      file_path: 'alias.txt',
      expected_version: aliasRead.file_version!,
      edits: [{ search: 'original', replace: 'changed' }]
    })
    expect(edited.success).toBe(true)
    expect((await lstat(aliasPath)).isSymbolicLink()).toBe(true)
    await expect(readFile(join(workspaceRoot, 'sample.txt'), 'utf-8')).resolves.toBe('changed')
    const aliasAfter = await processRead({ chat_uuid: chatUuid, file_path: 'alias.txt' })
    const targetAfter = await processRead({ chat_uuid: chatUuid, file_path: 'sample.txt' })
    expect(aliasAfter.file_version).toBe(edited.file_version)
    expect(targetAfter.file_version).toBe(edited.file_version)
    expect(aliasAfter.content).toBe(targetAfter.content)
  })

  it('rejects a replacement prefix that would introduce a second BOM', async () => {
    const raw = Buffer.from('\uFEFForiginal')
    const version = await seed(raw)
    const result = await processEdit({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: version,
      edits: [{ search: 'original', replace: '\uFEFFnew' }]
    })
    expect(result.failure?.code).toBe('FILE_TEXT_INVALID')
    await expect(readFile(join(workspaceRoot, 'sample.txt'))).resolves.toEqual(raw)
  })

  it.each([
    { operation: 'edit', invalid: { dry_run: 'false' }, code: 'FILE_ARGUMENTS_INVALID' },
    { operation: 'write', invalid: { create_dirs: 'false' }, code: 'FILE_ARGUMENTS_INVALID' },
    { operation: 'edit', invalid: { max_diagnostics: 1.5 }, code: 'EDIT_INPUT_INVALID' }
  ])('rejects invalid $operation controls $invalid before changing files or creating directories', async ({ operation, invalid, code }) => {
    const version = await seed('original')
    const result = operation === 'edit'
      ? await processEdit({
          chat_uuid: chatUuid,
          file_path: 'sample.txt',
          expected_version: version,
          edits: [{ search: 'original', replace: 'changed' }],
          ...invalid
        } as unknown as EditArgs)
      : await processWrite({
          chat_uuid: chatUuid,
          file_path: 'new/file.txt',
          expected_version: null,
          content: 'changed',
          ...invalid
        } as unknown as WriteArgs)
    expect(result.failure?.code).toBe(code)
    await expect(readFile(join(workspaceRoot, 'sample.txt'), 'utf-8')).resolves.toBe('original')
    await expect(lstat(join(workspaceRoot, 'new'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('replaces unique blocks against the same original file and returns the published version', async () => {
    const version = await seed('alpha\ntarget line\nomega')
    const result = await processEditFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: version,
      edits: [
        { search: 'alpha', replace: 'target line' },
        { search: 'target line', replace: 'updated line' },
      ],
    })
    expect(result).toMatchObject({
      success: true,
      status: 'replaced',
      replacements: 2,
    })
    const published = 'target line\nupdated line\nomega'
    expect(result.file_version).toBe(fileVersion(published))
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe(published)

    const next = await processEditFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: result.file_version!,
      edits: [{ search: 'omega', replace: 'done' }],
    })
    expect(next.success).toBe(true)
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe('target line\nupdated line\ndone')
  })

  it('keeps Unicode similarity diagnostics advisory when literal text does not match', async () => {
    const raw = '# Agent Genesis － 生存系统\n'
    const version = await seed(raw)
    const result = await processEditFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: version,
      edits: [
        {
          search: '# Agent Genesis — 生存系统',
          replace: '# Agent Genesis - 生存系统',
        },
      ],
    })
    expect(result).toMatchObject({
      success: false,
      status: 'no_match',
      replacements: 0,
      block_index: 0,
    })
    expect(result.failure?.code).toBe('EDIT_NO_MATCH')
    expect(result.diagnostics?.nearest_matches?.[0]).toMatchObject({
      line: 1,
      normalized_match: 'dash_equivalent',
    })
    expect(result.diagnostics?.nearest_matches?.[0].differences).toContainEqual(
      {
        index: 16,
        expected: '—',
        expected_codepoint: 'U+2014',
        actual: '－',
        actual_codepoint: 'U+FF0D',
      },
    )
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe(raw)
  })

  it('rejects an ambiguous block and reports original match locations', async () => {
    const raw = 'token\nmiddle\ntoken'
    const version = await seed(raw)
    const result = await processEditFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: version,
      edits: [{ search: 'token', replace: 'value' }],
    })
    expect(result).toMatchObject({
      success: false,
      status: 'multiple_matches',
      replacements: 0,
    })
    expect(result.failure?.code).toBe('EDIT_MULTIPLE_MATCHES')
    expect(result.diagnostics?.matches).toEqual([
      { line: 1, column: 1, preview: 'token' },
      { line: 3, column: 1, preview: 'token' },
    ])
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe(raw)
  })

  it.each([
    { search: 'missing', replace: 'new', status: 'no_match' },
    { search: 'token', replace: 'new', status: 'multiple_matches' },
  ])(
    'keeps all bytes when a later block fails with $status',
    async ({ search, replace, status }) => {
      const raw = 'unique\ntoken\ntoken'
      const version = await seed(raw)
      const result = await processEditFile({
        chat_uuid: chatUuid,
        file_path: 'sample.txt',
        expected_version: version,
        edits: [
          { search: 'unique', replace: 'changed' },
          { search, replace },
        ],
      })
      expect(result).toMatchObject({
        success: false,
        status,
        replacements: 0,
        block_index: 1,
      })
      await expect(
        readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
      ).resolves.toBe(raw)
    },
  )

  it.each([
    [
      { search: 'abc', replace: 'x' },
      { search: 'bcde', replace: 'y' },
    ],
    [
      { search: 'abcde', replace: 'x' },
      { search: 'bcd', replace: 'y' },
    ],
  ])(
    'rejects overlapping or nested replacement blocks before publishing',
    async (first, second) => {
      const version = await seed('abcdef')
      const result = await processEditFile({
        chat_uuid: chatUuid,
        file_path: 'sample.txt',
        expected_version: version,
        edits: [first, second],
      })
      expect(result).toMatchObject({
        success: false,
        status: 'overlapping_edits',
        replacements: 0,
      })
      expect(result.failure?.code).toBe('EDIT_OVERLAPPING_BLOCKS')
      await expect(
        readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
      ).resolves.toBe('abcdef')
    },
  )

  it('rejects overlapping occurrences inside one literal search', async () => {
    const version = await seed('aaa')
    const result = await processEditFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: version,
      edits: [{ search: 'aa', replace: 'x' }],
    })
    expect(result).toMatchObject({
      success: false,
      status: 'multiple_matches',
    })
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe('aaa')
  })

  it('validates a dry run and keeps the existing version and bytes', async () => {
    const version = await seed('alpha beta')
    const result = await processEditFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: version,
      edits: [{ search: 'beta', replace: 'gamma' }],
      dry_run: true,
    })
    expect(result).toMatchObject({
      success: true,
      status: 'dry_run',
      replacements: 1,
      file_version: version,
    })
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe('alpha beta')
  })

  it('rejects a stale version even when the old target text still exists', async () => {
    const version = await seed('alpha\ntarget\nomega')
    await writeFile(
      join(workspaceRoot, 'sample.txt'),
      'external alpha\ntarget\nomega',
    )
    const result = await processEditFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: version,
      edits: [{ search: 'target', replace: 'changed' }],
    })
    expect(result.success).toBe(false)
    expect(result.failure?.code).toBe('FILE_STALE_VERSION')
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe('external alpha\ntarget\nomega')
  })

  it('allows exactly one of two parallel disjoint edits based on the same version', async () => {
    const version = await seed('left\nright')
    const results = await Promise.all([
      processEditFile({
        chat_uuid: chatUuid,
        file_path: 'sample.txt',
        expected_version: version,
        edits: [{ search: 'left', replace: 'LEFT' }],
      }),
      processEditFile({
        chat_uuid: chatUuid,
        file_path: 'sample.txt',
        expected_version: version,
        edits: [{ search: 'right', replace: 'RIGHT' }],
      }),
    ])
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(
      results.filter((result) => result.failure?.code === 'FILE_STALE_VERSION'),
    ).toHaveLength(1)
    const actual = await readFile(join(workspaceRoot, 'sample.txt'), 'utf-8')
    expect(['LEFT\nright', 'left\nRIGHT']).toContain(actual)
  })

  it('cancels a queued embedded edit without releasing later processor work early', async () => {
    const version = await seed('original')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const active = withFileOperation(async () => gate)
    const controller = new AbortController()
    const cancelled = processEdit(
      {
        chat_uuid: chatUuid,
        file_path: 'sample.txt',
        expected_version: version,
        edits: [{ search: 'original', replace: 'cancelled' }],
      },
      { signal: controller.signal },
    )
    let completed = false
    const following = processWrite({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      content: 'following',
      expected_version: version,
    }).then((result) => {
      completed = true
      return result
    })
    try {
      controller.abort()
      expect((await cancelled).failure).toMatchObject({
        code: 'TOOL_CANCELLED',
        termination: 'cancelled',
        recovery: { action: 'stop' },
      })
      expect(completed).toBe(false)
      await expect(
        readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
      ).resolves.toBe('original')
    } finally {
      release()
      await active
    }
    expect((await following).success).toBe(true)
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe('following')
  })

  it('orders a directory move, an edit, and a read using the resulting path', async () => {
    await mkdir(join(workspaceRoot, 'before'))
    await writeFile(join(workspaceRoot, 'before', 'sample.txt'), 'original')
    const [moved, edited, read] = await Promise.all([
      processMv({
        chat_uuid: chatUuid,
        source_path: 'before',
        destination_path: 'after',
      }),
      processEdit({
        chat_uuid: chatUuid,
        file_path: 'after/sample.txt',
        expected_version: fileVersion('original'),
        edits: [{ search: 'original', replace: 'changed' }],
      }),
      processRead({ chat_uuid: chatUuid, file_path: 'after/sample.txt' }),
    ])
    expect(moved.success).toBe(true)
    expect(edited.success).toBe(true)
    expect(read).toMatchObject({
      success: true,
      content: 'changed',
      file_version: fileVersion('changed'),
    })
    await expect(
      readFile(join(workspaceRoot, 'before', 'sample.txt')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves BOM and CRLF while matching the same LF text returned by Read', async () => {
    await seed('\uFEFFone\r\ntarget\r\nend\r\n')
    const read = await processReadTextFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
    })
    expect(read.content).toBe('one\ntarget\nend\n')
    const result = await processEditFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: read.file_version!,
      edits: [{ search: 'one\ntarget', replace: 'one\nchanged\nadded' }],
    })
    expect(result.success).toBe(true)
    const bytes = Buffer.from('\uFEFFone\r\nchanged\r\nadded\r\nend\r\n')
    await expect(readFile(join(workspaceRoot, 'sample.txt'))).resolves.toEqual(
      bytes,
    )
    expect(result.file_version).toBe(fileVersion(bytes))
  })

  it('preserves mixed endings outside the exact replaced bytes', async () => {
    const raw = 'one\r\ntarget\nend\r'
    const version = await seed(raw)
    const result = await processEditFile({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      expected_version: version,
      edits: [{ search: 'target', replace: 'changed' }],
    })
    expect(result.success).toBe(true)
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe('one\r\nchanged\nend\r')
  })

  it.each([
    [
      'invalid UTF-8',
      Buffer.from([0x61, 0xc3, 0x28]),
      'FILE_ENCODING_UNSUPPORTED',
    ],
    ['NUL content', Buffer.from('alpha\0beta'), 'FILE_BINARY_UNSUPPORTED'],
  ])(
    'rejects editing %s without changing the file',
    async (_kind, raw, expectedCode) => {
      const version = await seed(raw)
      const result = await processEditFile({
        chat_uuid: chatUuid,
        file_path: 'sample.txt',
        expected_version: version,
        edits: [{ search: 'a', replace: 'A' }],
      })
      expect(result.failure?.code).toBe(expectedCode)
      await expect(
        readFile(join(workspaceRoot, 'sample.txt')),
      ).resolves.toEqual(raw)
    },
  )

  it.each(['\0', '\ud800', '\udfff'])(
    'rejects invalid replacement text %j without lossy encoding',
    async (replace) => {
      const version = await seed('original')
      const result = await processEditFile({
        chat_uuid: chatUuid,
        file_path: 'sample.txt',
        expected_version: version,
        edits: [{ search: 'original', replace }],
      })
      expect(result.success).toBe(false)
      await expect(
        readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
      ).resolves.toBe('original')
    },
  )

  it('requires the new batch contract and rejects retired matching controls', async () => {
    const version = await seed('original')
    for (const retired of [
      { search: 'original', replace: 'changed' },
      { regex: true },
      { all: true },
      { expected_replacements: 1 },
      { start_line: 1 },
      { end_line: 1 },
    ]) {
      const args = {
        chat_uuid: chatUuid,
        file_path: 'sample.txt',
        expected_version: version,
        edits: [{ search: 'original', replace: 'changed' }],
        ...retired,
      }
      const result = await processEditFile(args)
      expect(result.success).toBe(false)
      expect(result.failure?.code).toBe('EDIT_INPUT_INVALID')
    }
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe('original')
  })

  it('creates only when absent and requires the observed version for overwrites', async () => {
    const created = await processWrite({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      content: 'first',
      expected_version: null,
    })
    expect(created).toMatchObject({
      success: true,
      file_version: fileVersion('first'),
    })
    const blindCreate = await processWrite({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      content: 'clobbered',
      expected_version: null,
    })
    expect(blindCreate.failure?.code).toBe('FILE_ALREADY_EXISTS')
    const overwritten = await processWrite({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      content: 'second',
      expected_version: created.file_version!,
    })
    expect(overwritten).toMatchObject({
      success: true,
      file_version: fileVersion('second'),
    })
    const stale = await processWrite({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      content: 'stale',
      expected_version: created.file_version!,
    })
    expect(stale.failure?.code).toBe('FILE_STALE_VERSION')
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe('second')
  })

  it('requires an explicit version on both mutation entry points', async () => {
    await seed('original')
    const edit = await processEdit({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      edits: [{ search: 'original', replace: 'changed' }],
    } as unknown as EditArgs)
    const write = await processWrite({
      chat_uuid: chatUuid,
      file_path: 'sample.txt',
      content: 'changed',
    } as unknown as WriteArgs)
    expect(edit.failure?.code).toBe('FILE_VERSION_REQUIRED')
    expect(write.failure?.code).toBe('FILE_VERSION_REQUIRED')
    await expect(
      readFile(join(workspaceRoot, 'sample.txt'), 'utf-8'),
    ).resolves.toBe('original')
  })

  it.each(['\0', '\ud800', '\udfff'])(
    'rejects invalid write content %j before creating a file',
    async (content) => {
      const result = await processWrite({
        chat_uuid: chatUuid,
        file_path: 'sample.txt',
        content,
        expected_version: null,
      })
      expect(result.success).toBe(false)
      await expect(
        readFile(join(workspaceRoot, 'sample.txt')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )
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

  it('accepts embedded workspace absolute paths and preserves legacy IPC absolute paths', async () => {
    const filePath = join(workspaceRoot, 'nested', 'sample.txt')
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, 'safe', 'utf-8')

    const embeddedAbsolute = await processRead({ chat_uuid: 'safe-chat', file_path: filePath })
    expect(embeddedAbsolute).toMatchObject({ success: true, content: 'safe', file_path: 'nested/sample.txt' })

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
      chat_uuid: 'safe-chat', file_path: 'nested\\draft.txt', content: 'draft', expected_version: null
    })
    expect(writeResult).toMatchObject({ success: true, file_path: 'nested/draft.txt' })

    const editResult = await processEdit({
      chat_uuid: 'safe-chat',
      file_path: 'nested\\draft.txt',
      expected_version: writeResult.file_version!,
      edits: [{ search: 'draft', replace: 'ready' }]
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
      chat_uuid: 'safe-chat', file_path: 'external/new.txt', content: 'changed', expected_version: null
    })
    const editResult = await processEdit({
      chat_uuid: 'safe-chat', file_path: 'external-file', expected_version: fileVersion('original'),
      edits: [{ search: 'original', replace: 'changed' }]
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
      expected_version: fileVersion('workspace original'),
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
