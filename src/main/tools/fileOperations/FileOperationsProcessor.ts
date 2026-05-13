import { app } from 'electron'
import { readFile, writeFile, mkdir, copyFile, readdir, stat, rename } from 'fs/promises'
import { dirname, join, basename, isAbsolute, relative, resolve } from 'path'
import { existsSync, statSync, accessSync, constants } from 'fs'
import { lookup } from 'mime-types'
import DatabaseService from '@main/db/DatabaseService'
import { createLogger } from '@main/logging/LogService'
import type {
  ReadTextFileArgs,
  ReadTextFileResponse,
  ReadArgs,
  ReadResponse,
  ReadMediaFileArgs,
  ReadMediaFileResponse,
  ReadMediaArgs,
  ReadMediaResponse,
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

const logger = createLogger('FileOperationsProcessor')
const DEFAULT_READ_WINDOW_SIZE = 200
const MAX_READ_WINDOW_SIZE = 500
const DEFAULT_GLOB_MAX_RESULTS = 100
const DEFAULT_EDIT_DIAGNOSTICS_LIMIT = 5
const MAX_EDIT_DIAGNOSTICS_LIMIT = 20

// ============ Helper Functions ============

const DEFAULT_WORKSPACE_NAME = 'tmp'

function normalizeWorkspaceBaseDir(workspacePath: string, chatUuid?: string): string {
  const userDataPath = app.getPath('userData')
  const fallbackDir = join(userDataPath, 'workspaces', chatUuid || DEFAULT_WORKSPACE_NAME)

  if (!workspacePath) {
    return fallbackDir
  }

  if (isAbsolute(workspacePath)) {
    return resolve(workspacePath)
  }

  const normalized = workspacePath.replace(/\\/g, '/')
  const clean = normalized.startsWith('./') ? normalized.slice(2) : normalized

  if (clean.startsWith('workspaces/')) {
    return resolve(join(userDataPath, clean))
  }

  // Defensive fallback: prevent relative workspace paths from binding to process.cwd()
  logger.warn('workspace.relative_path_rebased', { workspacePath })
  return resolve(join(userDataPath, clean))
}

function resolveWorkspaceBaseDir(chatUuid?: string): string {
  const userDataPath = app.getPath('userData')

  if (!chatUuid) {
    return join(userDataPath, 'workspaces', DEFAULT_WORKSPACE_NAME)
  }

  try {
    const workspacePath = DatabaseService.getWorkspacePathByUuid(chatUuid)
    if (workspacePath) {
      return normalizeWorkspaceBaseDir(workspacePath, chatUuid)
    }
  } catch (error) {
    logger.error('workspace.resolve_from_db_failed', error)
  }

  return join(userDataPath, 'workspaces', chatUuid)
}

/**
 * Resolve file path with workspace support
 * Supports:
 * 1. Absolute paths (returned as-is, with a warning if outside baseDir)
 * 2. New format: relative path based on baseDir (e.g., "test.txt")
 * 3. Legacy format: workspace prefix included (e.g., "workspaces/123/test.txt")
 */
function resolveFilePath(relativePath: string, chatUuid?: string, baseDirOverride?: string): string {
  const userDataPath = app.getPath('userData')
  const baseDir = baseDirOverride ?? resolveWorkspaceBaseDir(chatUuid)

  // Allow absolute paths (used by custom workspace selection)
  if (isAbsolute(relativePath)) {
    const resolvedBase = resolve(baseDir)
    const target = resolve(relativePath)
    const rel = relative(resolvedBase, target)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      logger.warn('workspace.absolute_path_outside_base', { relativePath, baseDir })
    }
    return target
  }

  // Detect legacy format: paths starting with "workspaces/" or "./workspaces/"
  if (relativePath.startsWith('workspaces/') || relativePath.startsWith('./workspaces/')) {
    logger.debug('path.legacy_format_detected', { relativePath })
    const cleanPath = relativePath.startsWith('./') ? relativePath.slice(2) : relativePath
    return join(userDataPath, cleanPath)
  }

  // New format: resolve relative to baseDir
  const resolvedPath = join(baseDir, relativePath)
  logger.debug('path.resolved', { relativePath, resolvedPath, chatUuid: chatUuid ?? 'none' })
  return resolvedPath
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

/**
 * Read Text File Processor
 * 读取文本文件内容，支持指定行范围
 */
export async function processReadTextFile(args: ReadTextFileArgs): Promise<ReadTextFileResponse> {
  try {
    const { file_path, chat_uuid, encoding = 'utf-8', start_line, end_line, around_line, window_size } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    logger.debug('read_text_file.exists_check', { absolutePath, exists: existsSync(absolutePath) })

    if (!existsSync(absolutePath)) {
      logger.warn('read_text_file.not_found', { absolutePath, filePath: file_path })
      return { success: false, error: `File not found: ${file_path}` }
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
    const resultContent = lines.slice(startIndex, endIndex).join('\n')
    const returnedStartLine = startIndex + 1
    const returnedEndLine = endIndex

    logger.info('read_text_file.success', {
      filePath: file_path,
      totalLines,
      returnedStartLine,
      returnedEndLine,
      truncated
    })
    return {
      success: true,
      file_path,
      content: resultContent,
      lines: totalLines,
      returned_start_line: returnedStartLine,
      returned_end_line: returnedEndLine,
      truncated
    }
  } catch (error: any) {
    logger.error('read_text_file.failed', error)
    return { success: false, error: error.message || 'Failed to read file' }
  }
}

export async function processRead(args: ReadArgs): Promise<ReadResponse> {
  return processReadTextFile(args)
}

/**
 * Read Media File Processor
 * 读取二进制文件并返回 Base64 编码
 */
export async function processReadMediaFile(args: ReadMediaFileArgs): Promise<ReadMediaFileResponse> {
  try {
    const { file_path, chat_uuid } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    logger.info('read_media_file.start', { filePath: file_path, absolutePath })

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    const buffer = await readFile(absolutePath)
    const base64Content = buffer.toString('base64')
    const mimeType = lookup(absolutePath) || 'application/octet-stream'
    const size = buffer.length

    logger.info('read_media_file.success', { filePath: file_path, size, mimeType })
    return { success: true, file_path, content: base64Content, mime_type: mimeType, size }
  } catch (error: any) {
    logger.error('read_media_file.failed', error)
    return { success: false, error: error.message || 'Failed to read media file' }
  }
}

export async function processReadMedia(args: ReadMediaArgs): Promise<ReadMediaResponse> {
  return processReadMediaFile(args)
}

/**
 * Deprecated compatibility path kept for renderer IPC.
 * Embedded tools no longer expose multi-file reads.
 */
export async function processReadMultipleFiles(args: ReadMultipleFilesArgs): Promise<ReadMultipleFilesResponse> {
  try {
    const { file_paths, chat_uuid, encoding = 'utf-8' } = args
    logger.info('read_multiple_files.start', { count: file_paths.length })
    const baseDir = resolveWorkspaceBaseDir(chat_uuid)

    const files: FileContent[] = await Promise.all(
      file_paths.map(async (file_path) => {
        try {
          const absolutePath = resolveFilePath(file_path, chat_uuid, baseDir)
          if (!existsSync(absolutePath)) {
            return { file_path, success: false, error: 'File not found' }
          }
          const content = await readFile(absolutePath, encoding as BufferEncoding)
          const lines = content.split('\n').length
          return { file_path, success: true, content, lines }
        } catch (error: any) {
          return { file_path, success: false, error: error.message }
        }
      })
    )

    logger.info('read_multiple_files.success', { count: files.length })
    return { success: true, files, total_files: files.length }
  } catch (error: any) {
    logger.error('read_multiple_files.failed', error)
    return { success: false, error: error.message || 'Failed to read multiple files' }
  }
}

// ============ Write Operations ============

/**
 * Write File Processor
 * 写入文件内容，支持自动创建目录和备份
 */
export async function processWriteFile(args: WriteFileArgs): Promise<WriteFileResponse> {
  try {
    const { file_path, chat_uuid, content, encoding = 'utf-8', create_dirs = true, backup = false } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    logger.info('write_file.start', { filePath: file_path, absolutePath, backup, createDirs: create_dirs })

    // 如果需要备份且文件存在，先备份
    if (backup && existsSync(absolutePath)) {
      const backupPath = `${absolutePath}.backup`
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
    return { success: true, file_path, bytes_written: bytesWritten }
  } catch (error: any) {
    logger.error('write_file.failed', error)
    return { success: false, error: error.message || 'Failed to write file' }
  }
}

export async function processWrite(args: WriteArgs): Promise<WriteResponse> {
  return processWriteFile(args)
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
export async function processEditFile(args: EditFileArgs): Promise<EditFileResponse> {
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
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    logger.info('edit_file.start', {
      filePath: file_path,
      absolutePath,
      regex,
      replaceAll: all,
      dryRun: dry_run
    })

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    if (!regex && search.length === 0) {
      return { success: false, error: 'Search text must not be empty' }
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
        file_path,
        status: 'match_count_mismatch',
        replacements: 0,
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
        file_path,
        status: 'no_match',
        replacements: 0,
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
        file_path,
        status: 'multiple_matches',
        replacements: 0,
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
      file_path,
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
    return { success: false, error: error.message || 'Failed to edit file' }
  }
}

export async function processEdit(args: EditArgs): Promise<EditResponse> {
  return processEditFile(args)
}

// ============ Search Operations ============

/**
 * Search File Processor
 * 在文件中搜索匹配的内容，支持正则表达式和大小写敏感
 */
export async function processSearchFile(args: SearchFileArgs): Promise<SearchFileResponse> {
  try {
    const { file_path, chat_uuid, pattern, regex = false, case_sensitive = true, max_results = 100 } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    logger.info('search_file.start', { filePath: file_path, absolutePath })

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${file_path}` }
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
    return { success: true, file_path, matches, total_matches: matches.length }
  } catch (error: any) {
    logger.error('search_file.failed', error)
    return { success: false, error: error.message || 'Failed to search file' }
  }
}

/**
 * Search Files Processor
 * 在多个文件中搜索匹配的内容
 */
export async function processSearchFiles(args: SearchFilesArgs): Promise<SearchFilesResponse> {
  try {
    const { directory_path, chat_uuid, pattern, regex = false, case_sensitive = true, max_results = 100, file_pattern } = args
    const absoluteDirPath = resolveFilePath(directory_path, chat_uuid)
    logger.info('search_files.start', { directoryPath: directory_path, absoluteDirPath })

    if (!existsSync(absoluteDirPath)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const matches: FileSearchMatch[] = []
    let filesSearched = 0

    const searchInDirectory = async (dirPath: string) => {
      if (matches.length >= max_results) return

      const items = await readdir(dirPath)
      for (const item of items) {
        if (matches.length >= max_results) break

        const itemPath = join(dirPath, item)
        try {
          const stats = await stat(itemPath)

          if (stats.isDirectory()) {
            await searchInDirectory(itemPath)
          } else if (stats.isFile()) {
            // Check file pattern if specified
            if (file_pattern) {
              const fileRegex = new RegExp(file_pattern)
              if (!fileRegex.test(item)) continue
            }

            filesSearched++
            const content = await readFile(itemPath, 'utf-8')
            const lines = content.split('\n')

            const searchPattern = createSearchPattern(pattern, regex, case_sensitive)

            for (let i = 0; i < lines.length && matches.length < max_results; i++) {
              const line = lines[i]
              const lineMatches = line.matchAll(searchPattern)

              for (const match of lineMatches) {
                if (matches.length >= max_results) break
                matches.push({
                  file_path: itemPath,
                  line: i + 1,
                  content: line,
                  column: match.index !== undefined ? match.index + 1 : 0
                })
              }
            }
          }
        } catch (error) {
          continue
        }
      }
    }

    await searchInDirectory(absoluteDirPath)

    logger.info('search_files.success', { directoryPath: directory_path, totalMatches: matches.length, filesSearched })
    return { success: true, directory_path, matches, total_matches: matches.length, files_searched: filesSearched }
  } catch (error: any) {
    logger.error('search_files.failed', error)
    return { success: false, error: error.message || 'Failed to search files' }
  }
}

export async function processGrep(args: GrepArgs): Promise<GrepResponse> {
  try {
    const { path, chat_uuid, pattern, regex = true, case_sensitive = true, max_results = 100, file_pattern } = args
    const absolutePath = resolveFilePath(path, chat_uuid)
    logger.info('grep.start', { path, absolutePath })

    if (!existsSync(absolutePath)) {
      return { success: false, error: `Path not found: ${path}` }
    }

    const targetStats = await stat(absolutePath)

    if (targetStats.isFile()) {
      const fileResult = await processSearchFile({
        file_path: path,
        chat_uuid,
        pattern,
        regex,
        case_sensitive,
        max_results
      })

      return {
        success: fileResult.success,
        path,
        target_type: 'file',
        matches: (fileResult.matches || []).map((match) => ({
          file_path: path,
          line: match.line,
          content: match.content,
          column: match.column
        })),
        total_matches: fileResult.total_matches,
        files_searched: fileResult.success ? 1 : 0,
        error: fileResult.error
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
    })

    return {
      success: directoryResult.success,
      path,
      target_type: 'directory',
      matches: directoryResult.matches,
      total_matches: directoryResult.total_matches,
      files_searched: directoryResult.files_searched,
      error: directoryResult.error
    }
  } catch (error: any) {
    logger.error('grep.failed', error)
    return { success: false, error: error.message || 'Failed to grep path' }
  }
}

// ============ Directory Operations ============

/**
 * List Directory Processor
 * 列出目录内容
 */
export async function processListDirectory(args: ListDirectoryArgs): Promise<ListDirectoryResponse> {
  try {
    const { directory_path, chat_uuid } = args
    const absolutePath = resolveFilePath(directory_path, chat_uuid)
    logger.info('list_directory.start', { directoryPath: directory_path, absolutePath })

    if (!existsSync(absolutePath)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const items = await readdir(absolutePath)
    const entries: DirectoryEntry[] = []

    for (const item of items) {
      const itemPath = join(absolutePath, item)
      try {
        const stats = statSync(itemPath)
        const type = stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file'
        entries.push({ name: item, type, path: itemPath })
      } catch (error) {
        continue
      }
    }

    logger.info('list_directory.success', { directoryPath: directory_path, totalCount: entries.length })
    return { success: true, directory_path, entries, total_count: entries.length }
  } catch (error: any) {
    logger.error('list_directory.failed', error)
    return { success: false, error: error.message || 'Failed to list directory' }
  }
}

/**
 * List Directory With Sizes Processor
 * 列出目录内容，包含文件大小和修改时间
 */
export async function processListDirectoryWithSizes(args: ListDirectoryWithSizesArgs): Promise<ListDirectoryWithSizesResponse> {
  try {
    const { directory_path, chat_uuid } = args
    const absolutePath = resolveFilePath(directory_path, chat_uuid)
    logger.info('list_directory_with_sizes.start', { directoryPath: directory_path, absolutePath })

    if (!existsSync(absolutePath)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const items = await readdir(absolutePath)
    const entries: DirectoryEntryWithSize[] = []

    for (const item of items) {
      const itemPath = join(absolutePath, item)
      try {
        const stats = await stat(itemPath)
        const type = stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file'
        entries.push({
          name: item,
          type,
          path: itemPath,
          size: stats.size,
          modified: stats.mtime.toISOString()
        })
      } catch (error) {
        continue
      }
    }

    logger.info('list_directory_with_sizes.success', { directoryPath: directory_path, totalCount: entries.length })
    return { success: true, directory_path, entries, total_count: entries.length }
  } catch (error: any) {
    logger.error('list_directory_with_sizes.failed', error)
    return { success: false, error: error.message || 'Failed to list directory' }
  }
}

export async function processLs(args: LsArgs): Promise<LsResponse> {
  try {
    const { path, chat_uuid, details = false } = args
    const result = details
      ? await processListDirectoryWithSizes({ directory_path: path, chat_uuid })
      : await processListDirectory({ directory_path: path, chat_uuid })

    if (!result.success) {
      return { success: false, error: result.error }
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
      path,
      entries,
      total_count: result.total_count
    }
  } catch (error: any) {
    logger.error('ls.failed', error)
    return { success: false, error: error.message || 'Failed to list directory' }
  }
}

/**
 * Directory Tree Processor
 * 递归列出目录树结构
 */
export async function processDirectoryTree(args: DirectoryTreeArgs): Promise<DirectoryTreeResponse> {
  try {
    const { directory_path, chat_uuid, max_depth = 3 } = args
    const absolutePath = resolveFilePath(directory_path, chat_uuid)
    const userDataPath = app.getPath('userData')
    logger.info('directory_tree.start', { directoryPath: directory_path, absolutePath, maxDepth: max_depth })

    if (!existsSync(absolutePath)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const buildTree = async (dirPath: string, depth: number): Promise<TreeNode> => {
      const stats = await stat(dirPath)
      const name = basename(dirPath)

      // Convert absolute path back to relative path (relative to userData)
      const relativePath = dirPath.startsWith(userDataPath)
        ? dirPath.slice(userDataPath.length + 1).replace(/\\/g, '/')
        : dirPath

      if (!stats.isDirectory() || depth >= max_depth) {
        return { name, type: 'file', path: relativePath }
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
    return { success: true, directory_path, tree }
  } catch (error: any) {
    logger.error('directory_tree.failed', error)
    return { success: false, error: error.message || 'Failed to build directory tree' }
  }
}

export async function processTree(args: TreeArgs): Promise<TreeResponse> {
  return processDirectoryTree({
    directory_path: args.path,
    chat_uuid: args.chat_uuid,
    max_depth: args.max_depth
  })
}

export async function processGlob(args: GlobArgs): Promise<GlobResponse> {
  try {
    const { path, chat_uuid, pattern, max_results = DEFAULT_GLOB_MAX_RESULTS } = args
    const absoluteRootPath = resolveFilePath(path, chat_uuid)
    logger.info('glob.start', { path, absoluteRootPath, pattern, maxResults: max_results })

    if (!existsSync(absoluteRootPath)) {
      return { success: false, error: `Path not found: ${path}` }
    }

    const rootStats = await stat(absoluteRootPath)
    if (!rootStats.isDirectory()) {
      return { success: false, error: `Path is not a directory: ${path}` }
    }

    const matcher = globPatternToRegExp(pattern)
    const matches: GlobMatch[] = []
    const limit = Math.max(1, Math.floor(max_results))

    const walk = async (currentPath: string) => {
      if (matches.length >= limit) return

      const items = await readdir(currentPath)
      for (const item of items) {
        if (matches.length >= limit) break

        const itemPath = join(currentPath, item)
        let itemStats
        try {
          itemStats = await stat(itemPath)
        } catch {
          continue
        }

        const relativePath = normalizePathForMatching(relative(absoluteRootPath, itemPath)) || item
        const entryType = itemStats.isDirectory() ? 'directory' : 'file'

        if (matcher.test(relativePath)) {
          matches.push({
            path: relativePath,
            name: basename(itemPath),
            type: entryType
          })
        }

        if (itemStats.isDirectory()) {
          await walk(itemPath)
        }
      }
    }

    await walk(absoluteRootPath)

    return {
      success: true,
      path,
      matches,
      total_matches: matches.length
    }
  } catch (error: any) {
    logger.error('glob.failed', error)
    return { success: false, error: error.message || 'Failed to glob path' }
  }
}

// ============ File Info Operations ============

/**
 * Get File Info Processor
 * 获取文件详细信息
 */
export async function processGetFileInfo(args: GetFileInfoArgs): Promise<GetFileInfoResponse> {
  try {
    const { file_path, chat_uuid } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    logger.info('get_file_info.start', { filePath: file_path, absolutePath })

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    const stats = await stat(absolutePath)
    const type = stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file'

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
      path: file_path,
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
    return { success: false, error: error.message || 'Failed to get file info' }
  }
}

export async function processStat(args: StatArgs): Promise<StatResponse> {
  return processGetFileInfo(args)
}

/**
 * List Allowed Directories Processor
 * 列出允许访问的目录
 */
export async function processListAllowedDirectories(_args: ListAllowedDirectoriesArgs): Promise<ListAllowedDirectoriesResponse> {
  try {
    logger.info('list_allowed_directories.start')

    // TODO: Implement actual allowed directories logic
    // For now, return common directories
    const directories = [
      process.cwd(),
      process.env.HOME || process.env.USERPROFILE || '/'
    ]

    return { success: true, directories }
  } catch (error: any) {
    logger.error('list_allowed_directories.failed', error)
    return { success: false, error: error.message || 'Failed to list allowed directories' }
  }
}

// ============ File Management Operations ============

/**
 * Create Directory Processor
 * 创建目录
 */
export async function processCreateDirectory(args: CreateDirectoryArgs): Promise<CreateDirectoryResponse> {
  try {
    const { directory_path, chat_uuid, recursive = true } = args
    const absolutePath = resolveFilePath(directory_path, chat_uuid)
    logger.info('create_directory.start', { directoryPath: directory_path, absolutePath, recursive })

    if (existsSync(absolutePath)) {
      logger.info('create_directory.already_exists', { directoryPath: directory_path })
      return { success: true, directory_path, created: false }
    }

    await mkdir(absolutePath, { recursive })

    logger.info('create_directory.success', { directoryPath: directory_path })

    return { success: true, directory_path, created: true }
  } catch (error: any) {
    logger.error('create_directory.failed', error)
    return { success: false, error: error.message || 'Failed to create directory' }
  }
}

export async function processMkdir(args: MkdirArgs): Promise<MkdirResponse> {
  return processCreateDirectory(args)
}

/**
 * Move File Processor
 * 移动或重命名文件
 */
export async function processMoveFile(args: MoveFileArgs): Promise<MoveFileResponse> {
  try {
    const { source_path, destination_path, chat_uuid, overwrite = false } = args
    const absoluteSourcePath = resolveFilePath(source_path, chat_uuid)
    const absoluteDestPath = resolveFilePath(destination_path, chat_uuid)
    logger.info('move_file.start', {
      sourcePath: source_path,
      destinationPath: destination_path,
      absoluteSourcePath,
      absoluteDestPath,
      overwrite
    })

    if (!existsSync(absoluteSourcePath)) {
      return { success: false, error: `Source file not found: ${source_path}` }
    }

    if (existsSync(absoluteDestPath) && !overwrite) {
      return { success: false, error: `Destination already exists: ${destination_path}` }
    }

    await rename(absoluteSourcePath, absoluteDestPath)
    logger.info('move_file.success', { sourcePath: source_path, destinationPath: destination_path })
    return { success: true, source_path, destination_path }
  } catch (error: any) {
    logger.error('move_file.failed', error)
    return { success: false, error: error.message || 'Failed to move file' }
  }
}

export async function processMv(args: MvArgs): Promise<MvResponse> {
  return processMoveFile(args)
}
