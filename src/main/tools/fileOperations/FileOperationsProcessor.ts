import { readFile, writeFile, mkdir, copyFile, readdir, stat, lstat, rename } from 'fs/promises'
import { dirname, join, basename, isAbsolute, relative, resolve } from 'path'
import { existsSync, lstatSync, accessSync, constants } from 'fs'
import { createLogger } from '@main/logging/LogService'
import {
  isPathWithin,
  resolveWorkspacePath,
  resolveWorkspaceRoot,
  WorkspacePathError,
  type ResolvedWorkspacePath,
  type WorkspacePathIntent,
  type WorkspacePathMode
} from '@main/services/filesystem/WorkspacePathResolver'
import { runRipgrepFileList, runRipgrepSearch } from './RipgrepRunner'
import type {
  ReadTextFileArgs,
  ReadTextFileResponse,
  ReadArgs,
  ReadResponse,
  ReadMultipleFilesArgs,
  ReadMultipleFilesResponse,
  FileContent,
  WriteFileArgs,
  WriteFileResponse,
  WriteArgs,
  WriteResponse,
  EditFileArgs,
  EditFileResponse,
  EditCharacterDifference,
  EditMatchLocation,
  EditNearestMatch,
  EditArgs,
  EditResponse,
  SearchFileArgs,
  SearchFileResponse,
  SearchMatch,
  ListDirectoryArgs,
  ListDirectoryResponse,
  DirectoryEntry,
  ListDirectoryWithSizesArgs,
  ListDirectoryWithSizesResponse,
  DirectoryEntryWithSize,
  DirectoryTreeArgs,
  DirectoryTreeResponse,
  TreeNode,
  SearchFilesArgs,
  SearchFilesResponse,
  FileSearchMatch,
  GrepArgs,
  GrepResponse,
  LsArgs,
  LsEntry,
  LsResponse,
  TreeArgs,
  TreeResponse,
  GlobArgs,
  GlobMatch,
  GlobResponse,
  GetFileInfoArgs,
  GetFileInfoResponse,
  FileInfo,
  StatArgs,
  StatResponse,
  ListAllowedDirectoriesArgs,
  ListAllowedDirectoriesResponse,
  CreateDirectoryArgs,
  CreateDirectoryResponse,
  MkdirArgs,
  MkdirResponse,
  MoveFileArgs,
  MoveFileResponse,
  MvArgs,
  MvResponse
} from '@tools/fileOperations/index.d'
import {
  createToolFailure,
  type ToolFailure
} from '@shared/tools/toolFailure'

const logger = createLogger('FileOperationsProcessor')
const DEFAULT_READ_WINDOW_SIZE = 200
const MAX_READ_WINDOW_SIZE = 500
export const READ_RESULT_MAX_CHARACTERS = 32_000
const DEFAULT_GLOB_MAX_RESULTS = 100
const DEFAULT_EDIT_DIAGNOSTICS_LIMIT = 5
const MAX_EDIT_DIAGNOSTICS_LIMIT = 20
const DEFAULT_FILE_SEARCH_CONCURRENCY = 16
const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.turbo',
  '.vite',
  '.cache',
  'coverage'
])

interface FileFailureDefaults {
  code: string
  message: string
  category?: ToolFailure['category']
  recoveryAction?: ToolFailure['recovery']['action']
  recoveryMessage?: string
}

function fileErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function failureForFileError(error: unknown, defaults: FileFailureDefaults): ToolFailure {
  if (error instanceof WorkspacePathError) {
    const pathFailure: Record<WorkspacePathError['code'], {
      category: ToolFailure['category']
      recoveryAction: ToolFailure['recovery']['action']
      recoveryMessage: string
    }> = {
      PATH_INVALID_INPUT: {
        category: 'input',
        recoveryAction: 'correct_input',
        recoveryMessage: 'Provide a non-empty workspace path without NUL or parent segments.'
      },
      PATH_ABSOLUTE_REJECTED: {
        category: 'input',
        recoveryAction: 'correct_input',
        recoveryMessage: 'Use a path in the native platform format inside the workspace.'
      },
      PATH_OUTSIDE_WORKSPACE: {
        category: 'policy',
        recoveryAction: 'change_strategy',
        recoveryMessage: 'Choose a target inside the active workspace.'
      },
      PATH_TRAVERSAL_REJECTED: {
        category: 'input',
        recoveryAction: 'correct_input',
        recoveryMessage: 'Remove parent path segments from the workspace path.'
      },
      PATH_SYMLINK_ESCAPE: {
        category: 'policy',
        recoveryAction: 'change_strategy',
        recoveryMessage: 'Choose a path whose symlinks resolve inside the active workspace.'
      },
      PATH_CANONICALIZATION_FAILED: {
        category: 'policy',
        recoveryAction: 'check_state',
        recoveryMessage: 'Check the workspace path and its existing parent directories.'
      }
    }
    const mapped = pathFailure[error.code]
    return createToolFailure({
      category: mapped.category,
      code: error.code,
      message: error.message.replace(`${error.code}: `, ''),
      recovery: {
        action: mapped.recoveryAction,
        message: mapped.recoveryMessage
      },
      sourceCode: error.code
    })
  }

  const errorCode = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code
    : undefined
  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return createToolFailure({
      category: 'environment',
      code: 'FILESYSTEM_ACCESS_DENIED',
      message: 'The operating system denied access to the file or directory.',
      recovery: {
        action: 'check_environment',
        message: 'Check file permissions and the workspace mount.'
      },
      sourceCode: errorCode
    })
  }
  if (errorCode === 'ENOSPC' || errorCode === 'EDQUOT') {
    return createToolFailure({
      category: 'environment',
      code: 'FILESYSTEM_NO_SPACE',
      message: 'The workspace has insufficient storage for this operation.',
      recovery: {
        action: 'check_environment',
        message: 'Free workspace storage and retry the operation.'
      },
      sourceCode: errorCode
    })
  }

  return createToolFailure({
    category: defaults.category ?? (errorCode ? 'operation' : 'internal'),
    code: defaults.code,
    message: defaults.message,
    recovery: {
      action: defaults.recoveryAction ?? 'check_state',
      message: defaults.recoveryMessage ?? 'Check the current workspace state and adjust the operation.'
    },
    ...(errorCode ? { sourceCode: errorCode } : {})
  })
}

function fileNotFoundFailure(message: string, code = 'FILE_NOT_FOUND'): ToolFailure {
  return createToolFailure({
    category: 'operation',
    code,
    message,
    recovery: {
      action: 'check_state',
      message: 'Check that the target exists inside the workspace.'
    }
  })
}

// ============ Helper Functions ============

type FileToolPathContract = 'embedded' | 'legacy-ipc'

function pathModeForContract(contract: FileToolPathContract): WorkspacePathMode {
  return contract === 'embedded' ? 'workspace-contained' : 'legacy-compatible'
}

function resolveFilePath(
  inputPath: string,
  chatUuid: string | undefined,
  intent: WorkspacePathIntent,
  contract: FileToolPathContract,
  workspaceRootOverride?: string
): ResolvedWorkspacePath {
  const resolvedPath = resolveWorkspacePath(inputPath, {
    chatUuid,
    intent,
    mode: pathModeForContract(contract),
    workspaceRootOverride
  })

  if (resolvedPath.legacyInput) {
    logger.warn('path.legacy_input_accepted', { inputPath, chatUuid: chatUuid ?? 'none' })
  }
  logger.debug('path.resolved', {
    inputPath,
    resolvedPath: resolvedPath.absolutePath,
    relativePath: resolvedPath.relativePath,
    chatUuid: chatUuid ?? 'none',
    contract,
    intent
  })
  return resolvedPath
}

function displayChildPath(parent: ResolvedWorkspacePath, childName: string): string {
  return parent.relativePath === '.' ? childName : `${parent.relativePath}/${childName}`
}

function displayResolvedPath(
  resolvedPath: ResolvedWorkspacePath,
  inputPath: string,
  contract: FileToolPathContract
): string {
  return contract === 'embedded' ? resolvedPath.relativePath : inputPath
}

// ============ Read Operations ============

function clampReadWindowSize(windowSize?: number): number {
  if (!Number.isFinite(windowSize) || !windowSize || windowSize < 1) {
    return DEFAULT_READ_WINDOW_SIZE
  }

  return Math.min(Math.floor(windowSize), MAX_READ_WINDOW_SIZE)
}

function normalizeLineNumber(line?: number): number | undefined {
  if (!Number.isFinite(line) || line === undefined) {
    return undefined
  }

  return Math.max(1, Math.floor(line))
}

function resolveReadWindow(
  totalLines: number,
  startLine?: number,
  endLine?: number,
  aroundLine?: number,
  windowSize?: number
): { startIndex: number, endIndex: number, truncated: boolean } {
  const normalizedStartLine = normalizeLineNumber(startLine)
  const normalizedEndLine = normalizeLineNumber(endLine)
  const normalizedAroundLine = normalizeLineNumber(aroundLine)
  const implicitWindowSize = clampReadWindowSize(windowSize)

  if (normalizedStartLine !== undefined || normalizedEndLine !== undefined) {
    const explicitWindowSize = windowSize === undefined ? MAX_READ_WINDOW_SIZE : clampReadWindowSize(windowSize)
    const startIndex = Math.max(0, (normalizedStartLine ?? 1) - 1)
    const requestedEndIndex = normalizedEndLine ? Math.min(totalLines, normalizedEndLine) : totalLines
    const cappedEndIndex = Math.min(totalLines, startIndex + explicitWindowSize)
    const endIndex = Math.max(startIndex, Math.min(requestedEndIndex, cappedEndIndex))
    return {
      startIndex,
      endIndex,
      truncated: requestedEndIndex > cappedEndIndex
    }
  }

  if (normalizedAroundLine !== undefined) {
    const targetIndex = Math.min(totalLines - 1, Math.max(0, normalizedAroundLine - 1))
    const linesBefore = Math.floor((implicitWindowSize - 1) / 2)
    let startIndex = Math.max(0, targetIndex - linesBefore)
    let endIndex = Math.min(totalLines, startIndex + implicitWindowSize)
    startIndex = Math.max(0, endIndex - implicitWindowSize)

    return {
      startIndex,
      endIndex,
      truncated: totalLines > (endIndex - startIndex)
    }
  }

  return {
    startIndex: 0,
    endIndex: Math.min(totalLines, implicitWindowSize),
    truncated: totalLines > implicitWindowSize
  }
}

function createSearchPattern(pattern: string, regex = false, caseSensitive = true): RegExp {
  if (regex) {
    const flags = caseSensitive ? 'g' : 'gi'
    return new RegExp(pattern, flags)
  }

  const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flags = caseSensitive ? 'g' : 'gi'
  return new RegExp(escapedPattern, flags)
}

function normalizePathForMatching(value: string): string {
  return value.replace(/\\/g, '/')
}

function globPatternToRegExp(pattern: string): RegExp {
  const normalized = normalizePathForMatching(pattern)
  let regex = '^'

  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index]
    const nextChar = normalized[index + 1]

    if (char === '*') {
      if (nextChar === '*') {
        if (normalized[index + 2] === '/') {
          regex += '(?:.*/)?'
          index += 2
          continue
        }
        regex += '.*'
        index++
      } else {
        regex += '[^/]*'
      }
      continue
    }

    if (char === '?') {
      regex += '[^/]'
      continue
    }

    if ('\\^$+?.()|{}[]'.includes(char)) {
      regex += `\\${char}`
      continue
    }

    regex += char
  }

  regex += '$'
  return new RegExp(regex)
}

function shouldSkipDirectory(name: string): boolean {
  return IGNORED_DIRECTORY_NAMES.has(name) || name.startsWith('.xcode-')
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      await worker(item)
    }
  }))
}

/**
 * Read Text File Processor
 * 读取文本文件内容，支持指定行范围
 */
export async function processReadTextFile(
  args: ReadTextFileArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<ReadTextFileResponse> {
  try {
    const {
      file_path,
      chat_uuid,
      encoding = 'utf-8',
      start_line,
      start_column,
      end_line,
      around_line,
      window_size
    } = args
    const resolvedPath = resolveFilePath(file_path, chat_uuid, 'existing', contract)
    const absolutePath = resolvedPath.absolutePath
    logger.debug('read_text_file.exists_check', { absolutePath, exists: existsSync(absolutePath) })

    if (!existsSync(absolutePath)) {
      logger.warn('read_text_file.not_found', { absolutePath, filePath: file_path })
      return {
        success: false,
        error: `File not found: ${file_path}`,
        failure: fileNotFoundFailure('The requested file does not exist.')
      }
    }

    const content = await readFile(absolutePath, encoding as BufferEncoding)
    const lines = content.split('\n')
    const totalLines = lines.length
    const { startIndex, endIndex, truncated } = resolveReadWindow(
      totalLines,
      start_line,
      end_line,
      around_line,
      window_size
    )
    const normalizedStartColumn = start_line !== undefined
      ? Math.max(1, Math.floor(start_column ?? 1))
      : 1
    const windowLines = lines.slice(startIndex, endIndex)
    if (windowLines.length > 0) {
      windowLines[0] = windowLines[0].slice(normalizedStartColumn - 1)
    }
    const fullWindowContent = windowLines.join('\n')
    const characterLimited = fullWindowContent.length > READ_RESULT_MAX_CHARACTERS
    let characterEnd = Math.min(fullWindowContent.length, READ_RESULT_MAX_CHARACTERS)
    const lastCodeUnit = fullWindowContent.charCodeAt(characterEnd - 1)
    const nextCodeUnit = fullWindowContent.charCodeAt(characterEnd)
    if (
      characterEnd < fullWindowContent.length
      && lastCodeUnit >= 0xD800
      && lastCodeUnit <= 0xDBFF
      && nextCodeUnit >= 0xDC00
      && nextCodeUnit <= 0xDFFF
    ) {
      characterEnd--
    }
    const resultContent = fullWindowContent.slice(0, characterEnd)
    const returnedStartLine = startIndex + 1
    let returnedEndLine = returnedStartLine
    let returnedEndColumn = normalizedStartColumn - 1
    let nextStartLine = returnedStartLine
    let nextStartColumn = normalizedStartColumn
    for (let characterIndex = 0; characterIndex < resultContent.length; characterIndex++) {
      const character = resultContent[characterIndex]
      if (character === '\n') {
        returnedEndLine = nextStartLine
        returnedEndColumn = nextStartColumn - 1
        nextStartLine++
        nextStartColumn = 1
      } else {
        returnedEndLine = nextStartLine
        returnedEndColumn = nextStartColumn
        nextStartColumn++
      }
    }
    const hasLineContinuation = truncated && !characterLimited
    if (!characterLimited && resultContent.endsWith('\n')) {
      returnedEndLine = endIndex
      returnedEndColumn = 0
    }
    if (hasLineContinuation) {
      nextStartLine = endIndex + 1
      nextStartColumn = 1
    }
    const resultTruncated = truncated || characterLimited

    logger.info('read_text_file.success', {
      filePath: file_path,
      totalLines,
      returnedStartLine,
      returnedEndLine,
      truncated: resultTruncated
    })
    if (characterLimited) {
      logger.info('read_text_file.character_limit_applied', {
        filePath: displayResolvedPath(resolvedPath, file_path, contract),
        returnedCharacters: resultContent.length,
        nextStartLine,
        nextStartColumn
      })
    }
    return {
      success: true,
      file_path: displayResolvedPath(resolvedPath, file_path, contract),
      content: resultContent,
      lines: totalLines,
      returned_start_line: returnedStartLine,
      returned_end_line: returnedEndLine,
      returned_start_column: normalizedStartColumn,
      returned_end_column: returnedEndColumn,
      next_start_line: resultTruncated ? nextStartLine : undefined,
      next_start_column: resultTruncated ? nextStartColumn : undefined,
      truncated: resultTruncated
    }
  } catch (error: any) {
    logger.error('read_text_file.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to read file'),
      failure: failureForFileError(error, {
        code: 'FILE_READ_FAILED',
        message: 'The file could not be read.'
      })
    }
  }
}

export async function processRead(args: ReadArgs): Promise<ReadResponse> {
  return processReadTextFile(args, 'embedded')
}

/**
 * Deprecated compatibility path kept for renderer IPC.
 * Embedded tools no longer expose multi-file reads.
 */
export async function processReadMultipleFiles(args: ReadMultipleFilesArgs): Promise<ReadMultipleFilesResponse> {
  try {
    const { file_paths, chat_uuid, encoding = 'utf-8' } = args
    logger.info('read_multiple_files.start', { count: file_paths.length })
    const baseDir = resolveWorkspaceRoot(chat_uuid)

    const files: FileContent[] = await Promise.all(
      file_paths.map(async (file_path) => {
        try {
          const absolutePath = resolveFilePath(file_path, chat_uuid, 'existing', 'legacy-ipc', baseDir).absolutePath
          if (!existsSync(absolutePath)) {
            return {
              file_path,
              success: false,
              error: 'File not found',
              failure: fileNotFoundFailure('The requested file does not exist.')
            }
          }
          const content = await readFile(absolutePath, encoding as BufferEncoding)
          const lines = content.split('\n').length
          return { file_path, success: true, content, lines }
        } catch (error: any) {
          return {
            file_path,
            success: false,
            error: fileErrorMessage(error, 'Failed to read file'),
            failure: failureForFileError(error, {
              code: 'FILE_READ_FAILED',
              message: 'The file could not be read.'
            })
          }
        }
      })
    )

    logger.info('read_multiple_files.success', { count: files.length })
    return { success: true, files, total_files: files.length }
  } catch (error: any) {
    logger.error('read_multiple_files.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to read multiple files'),
      failure: failureForFileError(error, {
        code: 'FILES_READ_FAILED',
        message: 'The requested files could not be read.'
      })
    }
  }
}

// ============ Write Operations ============

/**
 * Write File Processor
 * 写入文件内容，支持自动创建目录和备份
 */
export async function processWriteFile(
  args: WriteFileArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<WriteFileResponse> {
  try {
    const { file_path, chat_uuid, content, encoding = 'utf-8', create_dirs = true, backup = false } = args
    if (typeof content !== 'string') {
      return {
        success: false,
        error: 'content must be a string',
        failure: createToolFailure({
          category: 'input',
          code: 'FILE_CONTENT_INVALID',
          message: 'content must be a string; an empty string creates an empty file.',
          recovery: { action: 'correct_input', message: 'Supply the text to write in content.' }
        })
      }
    }
    const resolvedPath = resolveFilePath(file_path, chat_uuid, 'creatable', contract)
    const absolutePath = resolvedPath.absolutePath
    logger.info('write_file.start', { filePath: file_path, absolutePath, backup, createDirs: create_dirs })

    // 如果需要备份且文件存在，先备份
    if (backup && existsSync(absolutePath)) {
      const backupPath = resolveFilePath(
        `${file_path}.backup`,
        chat_uuid,
        'destination',
        contract
      ).absolutePath
      await copyFile(absolutePath, backupPath)
      logger.info('write_file.backup_created', { backupPath })
    }

    // 如果需要创建目录
    if (create_dirs) {
      const dir = dirname(absolutePath)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
        logger.info('write_file.directory_created', { directory: dir })
      }
    }

    // 写入文件
    await writeFile(absolutePath, content, encoding as BufferEncoding)
    const bytesWritten = Buffer.byteLength(content, encoding as BufferEncoding)

    logger.info('write_file.success', { filePath: file_path, bytesWritten })
    return {
      success: true,
      file_path: displayResolvedPath(resolvedPath, file_path, contract),
      bytes_written: bytesWritten
    }
  } catch (error: any) {
    logger.error('write_file.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to write file'),
      failure: failureForFileError(error, {
        code: 'FILE_WRITE_FAILED',
        message: 'The file could not be written.'
      })
    }
  }
}

export async function processWrite(args: WriteArgs): Promise<WriteResponse> {
  return processWriteFile(args, 'embedded')
}

interface TextEditMatch {
  index: number
  length: number
}

interface TextEditRange {
  startIndex: number
  endIndex: number
}

interface LineInfo {
  line: number
  content: string
}

function clampDiagnosticsLimit(maxDiagnostics?: number): number {
  if (!Number.isFinite(maxDiagnostics) || maxDiagnostics === undefined || maxDiagnostics < 1) {
    return DEFAULT_EDIT_DIAGNOSTICS_LIMIT
  }

  return Math.min(Math.floor(maxDiagnostics), MAX_EDIT_DIAGNOSTICS_LIMIT)
}

function normalizeOptionalLine(line?: number): number | undefined {
  if (!Number.isFinite(line) || line === undefined) {
    return undefined
  }

  return Math.max(1, Math.floor(line))
}

function createLineStarts(content: string): number[] {
  const starts = [0]

  for (let index = 0; index < content.length; index++) {
    if (content[index] === '\n' && index + 1 <= content.length) {
      starts.push(index + 1)
    }
  }

  return starts
}

function resolveEditRange(content: string, startLine?: number, endLine?: number): TextEditRange {
  const lineStarts = createLineStarts(content)
  const totalLines = lineStarts.length
  const normalizedStartLine = normalizeOptionalLine(startLine) ?? 1
  const normalizedEndLine = normalizeOptionalLine(endLine) ?? totalLines
  const boundedStartLine = Math.min(normalizedStartLine, totalLines)
  const boundedEndLine = Math.min(Math.max(normalizedEndLine, boundedStartLine), totalLines)
  const startIndex = lineStarts[boundedStartLine - 1] ?? content.length
  const endIndex = boundedEndLine >= totalLines
    ? content.length
    : lineStarts[boundedEndLine]

  return { startIndex, endIndex }
}

function lineColumnForIndex(content: string, index: number, lineStarts = createLineStarts(content)): { line: number, column: number } {
  let low = 0
  let high = lineStarts.length - 1
  let lineIndex = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (lineStarts[mid] <= index) {
      lineIndex = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return {
    line: lineIndex + 1,
    column: index - lineStarts[lineIndex] + 1
  }
}

function lineContentAtIndex(content: string, index: number, lineStarts = createLineStarts(content)): string {
  const { line } = lineColumnForIndex(content, index, lineStarts)
  const startIndex = lineStarts[line - 1]
  const nextLineStart = lineStarts[line] ?? content.length
  const endIndex = content[nextLineStart - 1] === '\n' ? nextLineStart - 1 : nextLineStart
  return content.slice(startIndex, endIndex).replace(/\r$/, '')
}

function truncatePreview(value: string, maxLength = 240): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function collectStringMatches(content: string, search: string, range: TextEditRange): TextEditMatch[] {
  const matches: TextEditMatch[] = []

  if (search.length === 0) {
    return matches
  }

  let index = content.indexOf(search, range.startIndex)
  while (index !== -1) {
    if (index + search.length <= range.endIndex) {
      matches.push({ index, length: search.length })
    }

    const nextIndex = index + search.length
    if (nextIndex >= range.endIndex) {
      break
    }

    index = content.indexOf(search, nextIndex)
  }

  return matches
}

function collectRegexMatches(content: string, search: string, range: TextEditRange): TextEditMatch[] {
  const matches: TextEditMatch[] = []
  const pattern = new RegExp(search, 'g')
  let match = pattern.exec(content)

  while (match) {
    const matchLength = match[0].length
    if (match.index >= range.startIndex && match.index + matchLength <= range.endIndex) {
      matches.push({ index: match.index, length: matchLength })
    }

    if (matchLength === 0) {
      pattern.lastIndex++
    }

    match = pattern.exec(content)
  }

  return matches
}

function applyTextMatches(content: string, matches: TextEditMatch[], replace: string): string {
  let nextContent = ''
  let lastIndex = 0

  for (const match of matches) {
    nextContent += content.slice(lastIndex, match.index)
    nextContent += replace
    lastIndex = match.index + match.length
  }

  nextContent += content.slice(lastIndex)
  return nextContent
}

function createMatchLocations(content: string, matches: TextEditMatch[], limit: number): EditMatchLocation[] {
  const lineStarts = createLineStarts(content)

  return matches.slice(0, limit).map((match) => {
    const { line, column } = lineColumnForIndex(content, match.index, lineStarts)
    return {
      line,
      column,
      preview: truncatePreview(lineContentAtIndex(content, match.index, lineStarts))
    }
  })
}

function codePointLabel(value: string): string {
  const codePoint = value.codePointAt(0)
  if (codePoint === undefined) {
    return ''
  }

  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
}

function createCharacterDifferences(expected: string, actual: string, maxDifferences = 8): EditCharacterDifference[] {
  const expectedChars = Array.from(expected)
  const actualChars = Array.from(actual)
  const length = Math.max(expectedChars.length, actualChars.length)
  const differences: EditCharacterDifference[] = []

  for (let index = 0; index < length && differences.length < maxDifferences; index++) {
    const expectedChar = expectedChars[index] ?? ''
    const actualChar = actualChars[index] ?? ''

    if (expectedChar === actualChar) {
      continue
    }

    differences.push({
      index,
      expected: expectedChar,
      expected_codepoint: codePointLabel(expectedChar),
      actual: actualChar,
      actual_codepoint: codePointLabel(actualChar)
    })
  }

  return differences
}

function normalizeDashCharacters(value: string): string {
  return value.replace(/[-‐‑‒–—―﹘﹣－−]/g, '-')
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeForSimilarity(value: string): string {
  return normalizeWhitespace(normalizeDashCharacters(value.normalize('NFKC'))).toLowerCase()
}

function levenshteinDistance(a: string, b: string): number {
  const source = Array.from(a.slice(0, 300))
  const target = Array.from(b.slice(0, 300))
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index)
  let current = new Array<number>(target.length + 1)

  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex++) {
    current[0] = sourceIndex + 1

    for (let targetIndex = 0; targetIndex < target.length; targetIndex++) {
      const substitutionCost = source[sourceIndex] === target[targetIndex] ? 0 : 1
      current[targetIndex + 1] = Math.min(
        current[targetIndex] + 1,
        previous[targetIndex + 1] + 1,
        previous[targetIndex] + substitutionCost
      )
    }

    const nextPrevious = current
    current = previous
    previous = nextPrevious
  }

  return previous[target.length]
}

function similarityScore(expected: string, actual: string): number {
  const normalizedExpected = normalizeForSimilarity(expected)
  const normalizedActual = normalizeForSimilarity(actual)
  const maxLength = Math.max(normalizedExpected.length, normalizedActual.length)

  if (maxLength === 0) {
    return 1
  }

  const distance = levenshteinDistance(normalizedExpected, normalizedActual)
  return Math.max(0, 1 - distance / maxLength)
}

function normalizedMatchKind(expected: string, actual: string): EditNearestMatch['normalized_match'] | undefined {
  if (expected.normalize('NFKC') === actual.normalize('NFKC')) {
    return 'nfkc'
  }

  if (normalizeDashCharacters(expected) === normalizeDashCharacters(actual)) {
    return 'dash_equivalent'
  }

  if (normalizeWhitespace(expected) === normalizeWhitespace(actual)) {
    return 'whitespace_flexible'
  }

  return undefined
}

function diagnosticSearchLines(search: string): string[] {
  return Array.from(new Set(
    search
      .split(/\r?\n/)
      .map(line => line.trimEnd())
      .filter(line => line.trim().length > 0)
      .sort((a, b) => b.length - a.length)
      .slice(0, 5)
  ))
}

function linesInRange(content: string, range: TextEditRange): LineInfo[] {
  const lineStarts = createLineStarts(content)
  const lines: LineInfo[] = []

  for (let index = 0; index < lineStarts.length; index++) {
    const startIndex = lineStarts[index]
    const nextLineStart = lineStarts[index + 1] ?? content.length
    if (nextLineStart <= range.startIndex || startIndex >= range.endIndex) {
      continue
    }

    const lineEnd = content[nextLineStart - 1] === '\n' ? nextLineStart - 1 : nextLineStart
    lines.push({
      line: index + 1,
      content: content.slice(startIndex, lineEnd).replace(/\r$/, '')
    })
  }

  return lines
}

function findNearestMatches(content: string, search: string, range: TextEditRange, limit: number): EditNearestMatch[] {
  const searchLines = diagnosticSearchLines(search)
  const fileLines = linesInRange(content, range)
  const candidates = new Map<string, EditNearestMatch>()

  for (const expectedLine of searchLines) {
    for (const fileLine of fileLines) {
      if (fileLine.content.trim().length === 0) {
        continue
      }

      const normalizedMatch = normalizedMatchKind(expectedLine, fileLine.content)
      const score = similarityScore(expectedLine, fileLine.content)

      if (!normalizedMatch && score < 0.65) {
        continue
      }

      const key = `${fileLine.line}:${fileLine.content}`
      const candidate: EditNearestMatch = {
        line: fileLine.line,
        column: 1,
        score: Number(score.toFixed(3)),
        content: truncatePreview(fileLine.content),
        normalized_match: normalizedMatch,
        differences: createCharacterDifferences(expectedLine, fileLine.content)
      }
      const existing = candidates.get(key)

      if (!existing || candidate.score > existing.score) {
        candidates.set(key, candidate)
      }
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Edit File Processor
 * 编辑文件内容，支持字符串替换和正则替换
 */
export async function processEditFile(
  args: EditFileArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<EditFileResponse> {
  try {
    const {
      file_path,
      chat_uuid,
      search,
      replace,
      regex = false,
      all = false,
      dry_run = false,
      expected_replacements,
      start_line,
      end_line,
      max_diagnostics
    } = args
    const resolvedPath = resolveFilePath(file_path, chat_uuid, 'existing', contract)
    const absolutePath = resolvedPath.absolutePath
    const responseFilePath = displayResolvedPath(resolvedPath, file_path, contract)
    logger.info('edit_file.start', {
      filePath: file_path,
      absolutePath,
      regex,
      replaceAll: all,
      dryRun: dry_run
    })

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${file_path}`,
        failure: fileNotFoundFailure('The requested file does not exist.')
      }
    }

    if (!regex && search.length === 0) {
      return {
        success: false,
        error: 'Search text must not be empty',
        failure: createToolFailure({
          category: 'input',
          code: 'EDIT_SEARCH_EMPTY',
          message: 'The edit search text must not be empty.',
          recovery: {
            action: 'correct_input',
            message: 'Provide the exact text or a regular expression to replace.'
          }
        })
      }
    }

    const content = await readFile(absolutePath, 'utf-8')
    const diagnosticsLimit = clampDiagnosticsLimit(max_diagnostics)
    const editRange = resolveEditRange(content, start_line, end_line)
    const matches = regex
      ? collectRegexMatches(content, search, editRange)
      : collectStringMatches(content, search, editRange)
    const expectedCount = Number.isFinite(expected_replacements)
      ? Math.max(0, Math.floor(expected_replacements as number))
      : undefined
    const matchLocations = createMatchLocations(content, matches, diagnosticsLimit)

    if (expectedCount !== undefined && matches.length !== expectedCount) {
      logger.info('edit_file.match_count_mismatch', {
        filePath: file_path,
        matches: matches.length,
        expected: expectedCount
      })
      return {
        success: false,
        file_path: responseFilePath,
        status: 'match_count_mismatch',
        replacements: 0,
        failure: createToolFailure({
          category: 'operation',
          code: 'EDIT_MATCH_COUNT_MISMATCH',
          message: 'The number of matching ranges differs from the expected replacement count.',
          recovery: {
            action: 'change_strategy',
            message: 'Adjust the search range or expected replacement count, then submit the edit again.'
          }
        }),
        diagnostics: {
          message: `Expected ${expectedCount} replacement(s), found ${matches.length}.`,
          matches: matchLocations,
          nearest_matches: matches.length === 0
            ? findNearestMatches(content, search, editRange, diagnosticsLimit)
            : undefined
        }
      }
    }

    if (matches.length === 0) {
      logger.info('edit_file.no_matches', { filePath: file_path })
      return {
        success: false,
        file_path: responseFilePath,
        status: 'no_match',
        replacements: 0,
        failure: createToolFailure({
          category: 'operation',
          code: 'EDIT_NO_MATCH',
          message: 'The requested edit text was not found.',
          recovery: {
            action: 'change_strategy',
            message: 'Re-read the file and use an exact current text match.'
          }
        }),
        diagnostics: {
          message: 'No exact match found.',
          nearest_matches: findNearestMatches(content, search, editRange, diagnosticsLimit)
        }
      }
    }

    if (!all && matches.length > 1) {
      logger.info('edit_file.multiple_matches', { filePath: file_path, matches: matches.length })
      return {
        success: false,
        file_path: responseFilePath,
        status: 'multiple_matches',
        replacements: 0,
        failure: createToolFailure({
          category: 'operation',
          code: 'EDIT_MULTIPLE_MATCHES',
          message: 'The requested edit text matched multiple locations.',
          recovery: {
            action: 'change_strategy',
            message: 'Narrow the search text or explicitly enable all replacements.'
          }
        }),
        diagnostics: {
          message: `Found ${matches.length} matches. Use all=true for bulk replacement or narrow the search text.`,
          matches: matchLocations
        }
      }
    }

    const matchesToReplace = all ? matches : matches.slice(0, 1)
    const replacements = matchesToReplace.length
    const newContent = applyTextMatches(content, matchesToReplace, replace)

    if (!dry_run) {
      await writeFile(absolutePath, newContent, 'utf-8')
      logger.info('edit_file.replacements_applied', { filePath: file_path, replacements })
    } else {
      logger.info('edit_file.dry_run', { filePath: file_path, replacements })
    }

    return {
      success: true,
      file_path: responseFilePath,
      status: dry_run ? 'dry_run' : 'replaced',
      replacements,
      diagnostics: {
        message: dry_run
          ? `Dry run found ${replacements} replacement(s).`
          : `Applied ${replacements} replacement(s).`,
        matches: matchLocations
      }
    }
  } catch (error: any) {
    logger.error('edit_file.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to edit file'),
      failure: failureForFileError(error, {
        code: 'FILE_EDIT_FAILED',
        message: 'The file could not be edited.'
      })
    }
  }
}

export async function processEdit(args: EditArgs): Promise<EditResponse> {
  return processEditFile(args, 'embedded')
}

// ============ Search Operations ============

/**
 * Search File Processor
 * 在文件中搜索匹配的内容，支持正则表达式和大小写敏感
 */
export async function processSearchFile(
  args: SearchFileArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<SearchFileResponse> {
  try {
    const { file_path, chat_uuid, pattern, regex = false, case_sensitive = true, max_results = 100 } = args
    const resolvedPath = resolveFilePath(file_path, chat_uuid, 'existing', contract)
    const absolutePath = resolvedPath.absolutePath
    logger.info('search_file.start', { filePath: file_path, absolutePath })

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${file_path}`,
        failure: fileNotFoundFailure('The requested file does not exist.')
      }
    }

    const content = await readFile(absolutePath, 'utf-8')
    const lines = content.split('\n')
    const matches: SearchMatch[] = []

    const searchPattern = createSearchPattern(pattern, regex, case_sensitive)

    for (let i = 0; i < lines.length && matches.length < max_results; i++) {
      const line = lines[i]
      const lineMatches = line.matchAll(searchPattern)

      for (const match of lineMatches) {
        if (matches.length >= max_results) break
        matches.push({
          line: i + 1,
          content: line,
          column: match.index !== undefined ? match.index + 1 : 0
        })
      }
    }

    logger.info('search_file.success', { filePath: file_path, totalMatches: matches.length })
    return {
      success: true,
      file_path: displayResolvedPath(resolvedPath, file_path, contract),
      matches,
      total_matches: matches.length
    }
  } catch (error: any) {
    logger.error('search_file.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to search file'),
      failure: failureForFileError(error, {
        code: 'FILE_SEARCH_FAILED',
        message: 'The file could not be searched.'
      })
    }
  }
}

interface SearchCandidateFile {
  absolutePath: string
  relativePath: string
}

async function collectSearchCandidateFiles(
  traversalRoot: ResolvedWorkspacePath,
  directoryPath: string,
  filePattern?: RegExp
): Promise<SearchCandidateFile[]> {
  const candidates: SearchCandidateFile[] = []
  const items = await readdir(directoryPath)

  await runWithConcurrency(items, DEFAULT_FILE_SEARCH_CONCURRENCY, async (item) => {
    const itemPath = join(directoryPath, item)
    try {
      const stats = await lstat(itemPath)

      if (stats.isSymbolicLink()) return
      const safeItem = resolveWorkspacePath(itemPath, {
        mode: 'workspace-contained',
        intent: stats.isDirectory() ? 'traversal' : 'existing',
        workspaceRootOverride: traversalRoot.workspaceRoot
      })

      if (stats.isDirectory()) {
        if (shouldSkipDirectory(item)) {
          return
        }

        candidates.push(...await collectSearchCandidateFiles(traversalRoot, safeItem.absolutePath, filePattern))
        return
      }

      if (stats.isFile()) {
        if (filePattern && !filePattern.test(item)) {
          return
        }

        candidates.push({
          absolutePath: safeItem.absolutePath,
          relativePath: safeItem.relativePath
        })
      }
    } catch {
      return
    }
  })

  return candidates
}

/**
 * Search Files Processor
 * 在多个文件中搜索匹配的内容
 */
export async function processSearchFiles(
  args: SearchFilesArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<SearchFilesResponse> {
  try {
    const { directory_path, chat_uuid, pattern, regex = false, case_sensitive = true, max_results = 100, file_pattern } = args
    const resolvedRoot = resolveFilePath(directory_path, chat_uuid, 'traversal', contract)
    const absoluteDirPath = resolvedRoot.absolutePath
    logger.info('search_files.start', { directoryPath: directory_path, absoluteDirPath })

    if (!existsSync(absoluteDirPath)) {
      return {
        success: false,
        error: `Directory not found: ${directory_path}`,
        failure: fileNotFoundFailure('The requested directory does not exist.', 'DIRECTORY_NOT_FOUND')
      }
    }

    const matches: FileSearchMatch[] = []
    const searchPattern = createSearchPattern(pattern, regex, case_sensitive)
    const fileRegex = file_pattern ? new RegExp(file_pattern) : undefined
    const candidateFiles = await collectSearchCandidateFiles(resolvedRoot, absoluteDirPath, fileRegex)
    let filesSearched = 0

    await runWithConcurrency(candidateFiles, DEFAULT_FILE_SEARCH_CONCURRENCY, async (candidate) => {
      if (matches.length >= max_results) return

      try {
        filesSearched++
        const content = await readFile(candidate.absolutePath, 'utf-8')
        const lines = content.split('\n')

        for (let i = 0; i < lines.length && matches.length < max_results; i++) {
          const line = lines[i]
          const lineMatches = line.matchAll(searchPattern)

          for (const match of lineMatches) {
            if (matches.length >= max_results) break
            matches.push({
              file_path: contract === 'embedded' ? candidate.relativePath : candidate.absolutePath,
              line: i + 1,
              content: line,
              column: match.index !== undefined ? match.index + 1 : 0
            })
          }
        }
      } catch {
        return
      }
    })

    logger.info('search_files.success', { directoryPath: directory_path, totalMatches: matches.length, filesSearched })
    return {
      success: true,
      directory_path: displayResolvedPath(resolvedRoot, directory_path, contract),
      matches,
      total_matches: matches.length,
      files_searched: filesSearched
    }
  } catch (error: any) {
    logger.error('search_files.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to search files'),
      failure: failureForFileError(error, {
        code: 'FILES_SEARCH_FAILED',
        message: 'The requested directory could not be searched.'
      })
    }
  }
}

export async function processGrep(args: GrepArgs): Promise<GrepResponse> {
  try {
    const { path, chat_uuid, pattern, regex = true, case_sensitive = true, max_results = 100, file_pattern } = args
    const resolvedTarget = resolveFilePath(path, chat_uuid, 'traversal', 'embedded')
    const absolutePath = resolvedTarget.absolutePath
    logger.info('grep.start', { path, absolutePath })

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `Path not found: ${path}`,
        failure: fileNotFoundFailure('The requested path does not exist.', 'PATH_NOT_FOUND')
      }
    }

    const targetStats = await stat(absolutePath)
    const targetType = targetStats.isFile() ? 'file' : 'directory'

    try {
      const ripgrepResult = await runRipgrepSearch({
        targetPath: absolutePath,
        targetType,
        pattern,
        regex,
        caseSensitive: case_sensitive,
        maxResults: max_results,
        filePattern: targetType === 'directory' ? file_pattern : undefined
      })

      return {
        success: true,
        path: resolvedTarget.relativePath,
        target_type: targetType,
        matches: ripgrepResult.matches.map((match) => {
          const safeMatch = resolveFilePath(
            match.file_path,
            chat_uuid,
            'existing',
            'embedded',
            resolvedTarget.workspaceRoot
          )
          const staysWithinTarget = targetType === 'file'
            ? safeMatch.canonicalPath === resolvedTarget.canonicalPath
            : isPathWithin(safeMatch.canonicalPath, resolvedTarget.canonicalPath)
          if (!staysWithinTarget) {
            throw new WorkspacePathError(
              'PATH_TRAVERSAL_REJECTED',
              'Search result escaped the requested traversal root',
              match.file_path
            )
          }
          return {
            ...match,
            file_path: targetType === 'file' ? resolvedTarget.relativePath : safeMatch.relativePath
          }
        }),
        total_matches: ripgrepResult.total_matches,
        files_searched: targetType === 'file' ? 1 : ripgrepResult.files_searched
      }
    } catch (error: any) {
      logger.warn('grep.ripgrep_fallback', { error: error.message || String(error) })
    }

    if (targetStats.isFile()) {
      const fileResult = await processSearchFile({
        file_path: path,
        chat_uuid,
        pattern,
        regex,
        case_sensitive,
        max_results
      }, 'embedded')

      return {
        success: fileResult.success,
        path: resolvedTarget.relativePath,
        target_type: 'file',
        matches: (fileResult.matches || []).map((match) => ({
          file_path: resolvedTarget.relativePath,
          line: match.line,
          content: match.content,
          column: match.column
        })),
        total_matches: fileResult.total_matches,
        files_searched: fileResult.success ? 1 : 0,
        error: fileResult.error,
        failure: fileResult.failure
      }
    }

    const directoryResult = await processSearchFiles({
      directory_path: path,
      chat_uuid,
      pattern,
      regex,
      case_sensitive,
      max_results,
      file_pattern
    }, 'embedded')

    return {
      success: directoryResult.success,
      path: resolvedTarget.relativePath,
      target_type: 'directory',
      matches: directoryResult.matches,
      total_matches: directoryResult.total_matches,
      files_searched: directoryResult.files_searched,
      error: directoryResult.error,
      failure: directoryResult.failure
    }
  } catch (error: any) {
    logger.error('grep.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to grep path'),
      failure: failureForFileError(error, {
        code: 'GREP_FAILED',
        message: 'The path could not be searched.'
      })
    }
  }
}

// ============ Directory Operations ============

/**
 * List Directory Processor
 * 列出目录内容
 */
export async function processListDirectory(
  args: ListDirectoryArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<ListDirectoryResponse> {
  try {
    const { directory_path, chat_uuid } = args
    const resolvedRoot = resolveFilePath(directory_path, chat_uuid, 'traversal', contract)
    const absolutePath = resolvedRoot.absolutePath
    logger.info('list_directory.start', { directoryPath: directory_path, absolutePath })

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `Directory not found: ${directory_path}`,
        failure: fileNotFoundFailure('The requested directory does not exist.', 'DIRECTORY_NOT_FOUND')
      }
    }

    const items = await readdir(absolutePath)
    const entries: DirectoryEntry[] = []

    for (const item of items) {
      const itemPath = join(absolutePath, item)
      try {
        const stats = lstatSync(itemPath)
        const type = stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'directory' : 'file'
        entries.push({
          name: item,
          type,
          path: contract === 'embedded' ? displayChildPath(resolvedRoot, item) : itemPath
        })
      } catch (error) {
        continue
      }
    }

    logger.info('list_directory.success', { directoryPath: directory_path, totalCount: entries.length })
    return {
      success: true,
      directory_path: displayResolvedPath(resolvedRoot, directory_path, contract),
      entries,
      total_count: entries.length
    }
  } catch (error: any) {
    logger.error('list_directory.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to list directory'),
      failure: failureForFileError(error, {
        code: 'DIRECTORY_LIST_FAILED',
        message: 'The directory could not be listed.'
      })
    }
  }
}

/**
 * List Directory With Sizes Processor
 * 列出目录内容，包含文件大小和修改时间
 */
export async function processListDirectoryWithSizes(
  args: ListDirectoryWithSizesArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<ListDirectoryWithSizesResponse> {
  try {
    const { directory_path, chat_uuid } = args
    const resolvedRoot = resolveFilePath(directory_path, chat_uuid, 'traversal', contract)
    const absolutePath = resolvedRoot.absolutePath
    logger.info('list_directory_with_sizes.start', { directoryPath: directory_path, absolutePath })

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `Directory not found: ${directory_path}`,
        failure: fileNotFoundFailure('The requested directory does not exist.', 'DIRECTORY_NOT_FOUND')
      }
    }

    const items = await readdir(absolutePath)
    const entries: DirectoryEntryWithSize[] = []

    for (const item of items) {
      const itemPath = join(absolutePath, item)
      try {
        const stats = await lstat(itemPath)
        const type = stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'directory' : 'file'
        entries.push({
          name: item,
          type,
          path: contract === 'embedded' ? displayChildPath(resolvedRoot, item) : itemPath,
          size: stats.size,
          modified: stats.mtime.toISOString()
        })
      } catch (error) {
        continue
      }
    }

    logger.info('list_directory_with_sizes.success', { directoryPath: directory_path, totalCount: entries.length })
    return {
      success: true,
      directory_path: displayResolvedPath(resolvedRoot, directory_path, contract),
      entries,
      total_count: entries.length
    }
  } catch (error: any) {
    logger.error('list_directory_with_sizes.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to list directory'),
      failure: failureForFileError(error, {
        code: 'DIRECTORY_LIST_FAILED',
        message: 'The directory could not be listed.'
      })
    }
  }
}

export async function processLs(args: LsArgs): Promise<LsResponse> {
  try {
    const { path, chat_uuid, details = false } = args
    const result = details
      ? await processListDirectoryWithSizes({ directory_path: path, chat_uuid }, 'embedded')
      : await processListDirectory({ directory_path: path, chat_uuid }, 'embedded')

    if (!result.success) {
      return { success: false, error: result.error, failure: result.failure }
    }

    const entries: LsEntry[] = (result.entries || []).map((entry: DirectoryEntry | DirectoryEntryWithSize) => ({
      name: entry.name,
      type: entry.type,
      path: entry.path,
      size: 'size' in entry ? entry.size : undefined,
      modified: 'modified' in entry ? entry.modified : undefined
    }))

    return {
      success: true,
      path: result.directory_path,
      entries,
      total_count: result.total_count
    }
  } catch (error: any) {
    logger.error('ls.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to list directory'),
      failure: failureForFileError(error, {
        code: 'LS_FAILED',
        message: 'The directory could not be listed.'
      })
    }
  }
}

/**
 * Directory Tree Processor
 * 递归列出目录树结构
 */
export async function processDirectoryTree(
  args: DirectoryTreeArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<DirectoryTreeResponse> {
  try {
    const { directory_path, chat_uuid, max_depth = 3 } = args
    const resolvedRoot = resolveFilePath(directory_path, chat_uuid, 'traversal', contract)
    const absolutePath = resolvedRoot.absolutePath
    logger.info('directory_tree.start', { directoryPath: directory_path, absolutePath, maxDepth: max_depth })

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `Directory not found: ${directory_path}`,
        failure: fileNotFoundFailure('The requested directory does not exist.', 'DIRECTORY_NOT_FOUND')
      }
    }

    const buildTree = async (dirPath: string, depth: number): Promise<TreeNode> => {
      const stats = await lstat(dirPath)
      const name = basename(dirPath)

      const pathFromRoot = normalizePathForMatching(relative(absolutePath, dirPath))
      const relativePath = pathFromRoot
        ? (resolvedRoot.relativePath === '.' ? pathFromRoot : `${resolvedRoot.relativePath}/${pathFromRoot}`)
        : resolvedRoot.relativePath

      if (stats.isSymbolicLink()) {
        return { name, type: 'symlink', path: relativePath }
      }

      resolveWorkspacePath(dirPath, {
        mode: 'workspace-contained',
        intent: stats.isDirectory() ? 'traversal' : 'existing',
        workspaceRootOverride: resolvedRoot.workspaceRoot
      })

      if (!stats.isDirectory() || depth >= max_depth) {
        return { name, type: stats.isDirectory() ? 'directory' : 'file', path: relativePath }
      }

      const items = await readdir(dirPath)
      const children: TreeNode[] = []

      for (const item of items) {
        const itemPath = join(dirPath, item)
        try {
          const childNode = await buildTree(itemPath, depth + 1)
          children.push(childNode)
        } catch (error) {
          continue
        }
      }

      return { name, type: 'directory', path: relativePath, children }
    }

    const tree = await buildTree(absolutePath, 0)
    logger.info('directory_tree.success', { directoryPath: directory_path })
    return {
      success: true,
      directory_path: displayResolvedPath(resolvedRoot, directory_path, contract),
      tree
    }
  } catch (error: any) {
    logger.error('directory_tree.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to build directory tree'),
      failure: failureForFileError(error, {
        code: 'DIRECTORY_TREE_FAILED',
        message: 'The directory tree could not be built.'
      })
    }
  }
}

export async function processTree(args: TreeArgs): Promise<TreeResponse> {
  const result = await processDirectoryTree({
    directory_path: args.path,
    chat_uuid: args.chat_uuid,
    max_depth: args.max_depth
  }, 'embedded')
  return { ...result, path: result.success ? result.directory_path : undefined }
}

async function collectGlobMatches(
  rootPath: string,
  currentPath: string,
  matcher: RegExp,
  matches: GlobMatch[],
  limit: number,
  options: {
    includeFiles: boolean
    includeDirectories: boolean
    includeSymlinks: boolean
    outputPrefix: string
    workspaceRoot: string
  }
): Promise<void> {
  if (matches.length >= limit) return

  const items = await readdir(currentPath)
  await runWithConcurrency(items, DEFAULT_FILE_SEARCH_CONCURRENCY, async (item) => {
    if (matches.length >= limit) return
    const itemPath = join(currentPath, item)
    let itemStats
    try {
      itemStats = await lstat(itemPath)
    } catch {
      return
    }

    const relativePath = normalizePathForMatching(relative(rootPath, itemPath)) || item
    const entryType = itemStats.isSymbolicLink() ? 'symlink' : itemStats.isDirectory() ? 'directory' : 'file'
    if (entryType === 'directory' && shouldSkipDirectory(item)) {
      return
    }

    if (entryType !== 'symlink') {
      resolveWorkspacePath(itemPath, {
        mode: 'workspace-contained',
        intent: entryType === 'directory' ? 'traversal' : 'existing',
        workspaceRootOverride: options.workspaceRoot
      })
    }

    const shouldInclude = entryType === 'directory'
      ? options.includeDirectories
      : entryType === 'symlink'
        ? options.includeSymlinks
        : options.includeFiles

    if (shouldInclude && matcher.test(relativePath)) {
      const outputPath = options.outputPrefix === '.'
        ? relativePath
        : `${options.outputPrefix}/${relativePath}`
      matches.push({
        path: outputPath,
        name: basename(itemPath),
        type: entryType
      })
    }

    if (entryType === 'directory') {
      await collectGlobMatches(rootPath, itemPath, matcher, matches, limit, options)
    }
  })
}

export async function processGlob(args: GlobArgs): Promise<GlobResponse> {
  try {
    const { path, chat_uuid, pattern, max_results = DEFAULT_GLOB_MAX_RESULTS } = args
    const resolvedRoot = resolveFilePath(path, chat_uuid, 'traversal', 'embedded')
    const absoluteRootPath = resolvedRoot.absolutePath
    logger.info('glob.start', { path, absoluteRootPath, pattern, maxResults: max_results })

    if (!existsSync(absoluteRootPath)) {
      return {
        success: false,
        error: `Path not found: ${path}`,
        failure: fileNotFoundFailure('The requested path does not exist.', 'PATH_NOT_FOUND')
      }
    }

    const rootStats = await stat(absoluteRootPath)
    if (!rootStats.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${path}`,
        failure: createToolFailure({
          category: 'operation',
          code: 'PATH_NOT_DIRECTORY',
          message: 'The requested path is a file rather than a directory.',
          recovery: {
            action: 'correct_input',
            message: 'Provide a directory path for this operation.'
          }
        })
      }
    }

    const matcher = globPatternToRegExp(pattern)
    const matches: GlobMatch[] = []
    const limit = Math.max(1, Math.floor(max_results))

    try {
      const ripgrepResult = await runRipgrepFileList({
        rootPath: absoluteRootPath,
        pattern,
        maxResults: limit
      })

      for (const filePath of ripgrepResult.files) {
        if (matches.length >= limit) break

        const emittedAbsolutePath = isAbsolute(filePath)
          ? filePath
          : resolve(absoluteRootPath, filePath)
        const safeMatch = resolveFilePath(
          emittedAbsolutePath,
          chat_uuid,
          'existing',
          'embedded',
          resolvedRoot.workspaceRoot
        )
        if (!isPathWithin(safeMatch.canonicalPath, resolvedRoot.canonicalPath)) {
          throw new WorkspacePathError(
            'PATH_TRAVERSAL_REJECTED',
            'Glob result escaped the requested traversal root',
            filePath
          )
        }
        const relativePath = normalizePathForMatching(
          relative(resolvedRoot.canonicalPath, safeMatch.canonicalPath)
        )
        if (matcher.test(relativePath)) {
          matches.push({
            path: safeMatch.relativePath,
            name: basename(relativePath),
            type: 'file'
          })
        }
      }

      await collectGlobMatches(absoluteRootPath, absoluteRootPath, matcher, matches, limit, {
        includeFiles: false,
        includeDirectories: true,
        includeSymlinks: true,
        outputPrefix: resolvedRoot.relativePath,
        workspaceRoot: resolvedRoot.workspaceRoot
      })
    } catch (error: any) {
      logger.warn('glob.ripgrep_fallback', { error: error.message || String(error) })
      await collectGlobMatches(absoluteRootPath, absoluteRootPath, matcher, matches, limit, {
        includeFiles: true,
        includeDirectories: true,
        includeSymlinks: true,
        outputPrefix: resolvedRoot.relativePath,
        workspaceRoot: resolvedRoot.workspaceRoot
      })
    }

    return {
      success: true,
      path: resolvedRoot.relativePath,
      matches,
      total_matches: matches.length
    }
  } catch (error: any) {
    logger.error('glob.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to glob path'),
      failure: failureForFileError(error, {
        code: 'GLOB_FAILED',
        message: 'The path could not be searched with the glob pattern.'
      })
    }
  }
}

// ============ File Info Operations ============

/**
 * Get File Info Processor
 * 获取文件详细信息
 */
export async function processGetFileInfo(
  args: GetFileInfoArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<GetFileInfoResponse> {
  try {
    const { file_path, chat_uuid } = args
    const resolvedPath = resolveFilePath(file_path, chat_uuid, 'existing', contract)
    const absolutePath = resolvedPath.absolutePath
    logger.info('get_file_info.start', { filePath: file_path, absolutePath })

    if (!existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${file_path}`,
        failure: fileNotFoundFailure('The requested file does not exist.')
      }
    }

    const stats = await lstat(absolutePath)
    const type = stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'directory' : 'file'

    let isReadable = false
    let isWritable = false
    try {
      accessSync(absolutePath, constants.R_OK)
      isReadable = true
    } catch { }
    try {
      accessSync(absolutePath, constants.W_OK)
      isWritable = true
    } catch { }

    const info: FileInfo = {
      path: displayResolvedPath(resolvedPath, file_path, contract),
      name: basename(absolutePath),
      type,
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      permissions: stats.mode.toString(8).slice(-3),
      is_readable: isReadable,
      is_writable: isWritable
    }

    logger.info('get_file_info.success', { filePath: file_path })
    return { success: true, info }
  } catch (error: any) {
    logger.error('get_file_info.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to get file info'),
      failure: failureForFileError(error, {
        code: 'FILE_INFO_FAILED',
        message: 'The file metadata could not be read.'
      })
    }
  }
}

export async function processStat(args: StatArgs): Promise<StatResponse> {
  return processGetFileInfo({ file_path: args.path, chat_uuid: args.chat_uuid }, 'embedded')
}

/**
 * List Allowed Directories Processor
 * 列出允许访问的目录
 */
export async function processListAllowedDirectories(args: ListAllowedDirectoriesArgs): Promise<ListAllowedDirectoriesResponse> {
  try {
    logger.info('list_allowed_directories.start')

    const workspace = resolveFilePath('.', args.chat_uuid, 'traversal', 'embedded')
    const directories = [workspace.canonicalWorkspaceRoot]

    return { success: true, directories }
  } catch (error: any) {
    logger.error('list_allowed_directories.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to list allowed directories'),
      failure: failureForFileError(error, {
        code: 'ALLOWED_DIRECTORIES_FAILED',
        message: 'The workspace boundary could not be resolved.'
      })
    }
  }
}

// ============ File Management Operations ============

/**
 * Create Directory Processor
 * 创建目录
 */
export async function processCreateDirectory(
  args: CreateDirectoryArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<CreateDirectoryResponse> {
  try {
    const { directory_path, chat_uuid, recursive = true } = args
    const resolvedPath = resolveFilePath(directory_path, chat_uuid, 'creatable', contract)
    const absolutePath = resolvedPath.absolutePath
    const responseDirectoryPath = displayResolvedPath(resolvedPath, directory_path, contract)
    logger.info('create_directory.start', { directoryPath: directory_path, absolutePath, recursive })

    if (existsSync(absolutePath)) {
      logger.info('create_directory.already_exists', { directoryPath: directory_path })
      return { success: true, directory_path: responseDirectoryPath, created: false }
    }

    await mkdir(absolutePath, { recursive })

    logger.info('create_directory.success', { directoryPath: directory_path })

    return { success: true, directory_path: responseDirectoryPath, created: true }
  } catch (error: any) {
    logger.error('create_directory.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to create directory'),
      failure: failureForFileError(error, {
        code: 'DIRECTORY_CREATE_FAILED',
        message: 'The directory could not be created.'
      })
    }
  }
}

export async function processMkdir(args: MkdirArgs): Promise<MkdirResponse> {
  return processCreateDirectory(args, 'embedded')
}

/**
 * Move File Processor
 * 移动或重命名文件
 */
export async function processMoveFile(
  args: MoveFileArgs,
  contract: FileToolPathContract = 'legacy-ipc'
): Promise<MoveFileResponse> {
  try {
    const { source_path, destination_path, chat_uuid, overwrite = false } = args
    const resolvedSource = resolveFilePath(source_path, chat_uuid, 'source', contract)
    const resolvedDestination = resolveFilePath(destination_path, chat_uuid, 'destination', contract)
    const absoluteSourcePath = resolvedSource.absolutePath
    const absoluteDestPath = resolvedDestination.absolutePath
    logger.info('move_file.start', {
      sourcePath: source_path,
      destinationPath: destination_path,
      absoluteSourcePath,
      absoluteDestPath,
      overwrite
    })

    if (!existsSync(absoluteSourcePath)) {
      return {
        success: false,
        error: `Source file not found: ${source_path}`,
        failure: fileNotFoundFailure('The move source does not exist.', 'MOVE_SOURCE_NOT_FOUND')
      }
    }

    if (existsSync(absoluteDestPath) && !overwrite) {
      return {
        success: false,
        error: `Destination already exists: ${destination_path}`,
        failure: createToolFailure({
          category: 'operation',
          code: 'MOVE_DESTINATION_EXISTS',
          message: 'The move destination already exists.',
          recovery: {
            action: 'change_strategy',
            message: 'Choose another destination or enable overwrite intentionally.'
          }
        })
      }
    }

    await rename(absoluteSourcePath, absoluteDestPath)
    logger.info('move_file.success', { sourcePath: source_path, destinationPath: destination_path })
    return {
      success: true,
      source_path: displayResolvedPath(resolvedSource, source_path, contract),
      destination_path: displayResolvedPath(resolvedDestination, destination_path, contract)
    }
  } catch (error: any) {
    logger.error('move_file.failed', error)
    return {
      success: false,
      error: fileErrorMessage(error, 'Failed to move file'),
      failure: failureForFileError(error, {
        code: 'FILE_MOVE_FAILED',
        message: 'The file could not be moved.'
      })
    }
  }
}

export async function processMv(args: MvArgs): Promise<MvResponse> {
  return processMoveFile(args, 'embedded')
}
