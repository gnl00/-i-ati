import { access, readFile, readdir } from 'fs/promises'
import { basename, join } from 'path'
import { gunzip as gunzipCallback } from 'zlib'
import { promisify } from 'util'
import { createLogger } from '@main/logging/LogService'
import { LogFileManager } from '@main/logging/LogFileManager'
import type {
  LogSearchArgs,
  LogSearchBlock,
  LogSearchResponse,
  LogSearchTarget
} from '@tools/log/index.d'

const gunzip = promisify(gunzipCallback)
const logger = createLogger('LogToolsProcessor')
const logFileManager = new LogFileManager()

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_TAIL_LINES = 200
const MAX_TAIL_LINES = 1000
const DEFAULT_CONTEXT_BEFORE = 10
const DEFAULT_CONTEXT_AFTER = 20
const MAX_CONTEXT_LINES = 50
const DEFAULT_MAX_MATCHES = 20
const MAX_MATCHES = 50
const MAX_TOTAL_RETURNED_LINES = 1000

function isValidDateKey(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  const year = `${date.getFullYear()}`
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}` === value
}

function clampPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback
  }

  return Math.min(Math.max(1, Math.floor(value)), max)
}

function clampNonNegativeInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback
  }

  return Math.min(Math.max(0, Math.floor(value)), max)
}

function normalizeOptionalText(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function includesWithCase(haystack: string, needle: string, caseSensitive: boolean): boolean {
  if (caseSensitive) {
    return haystack.includes(needle)
  }

  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function splitLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines
}

function resolveLogPrefix(target: LogSearchTarget): string {
  return target === 'app' ? 'app' : 'perf'
}

async function resolveLogFile(target: LogSearchTarget, date: string): Promise<string | null> {
  const logsDir = logFileManager.getLogsDir()
  const prefix = resolveLogPrefix(target)
  const candidates = [
    join(logsDir, `${prefix}-${date}.log`),
    join(logsDir, `${prefix}-${date}.log.gz`)
  ]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  return null
}

async function listRecentAvailableLogFiles(target: LogSearchTarget, limit = 7): Promise<string[]> {
  const logsDir = logFileManager.getLogsDir()
  const prefix = `${resolveLogPrefix(target)}-`

  try {
    const fileNames = await readdir(logsDir)

    return fileNames
      .filter(fileName => fileName.startsWith(prefix) && (fileName.endsWith('.log') || fileName.endsWith('.log.gz')))
      .map(fileName => {
        const date = fileName.endsWith('.log.gz')
          ? fileName.slice(prefix.length, -'.log.gz'.length)
          : fileName.slice(prefix.length, -'.log'.length)

        return {
          fileName,
          date
        }
      })
      .filter(item => isValidDateKey(item.date))
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, limit)
      .map(item => item.fileName)
  } catch {
    return []
  }
}

async function readLogFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  if (filePath.endsWith('.gz')) {
    const decompressed = await gunzip(buffer)
    return decompressed.toString('utf-8')
  }

  return buffer.toString('utf-8')
}

function lineMatchesQuery(line: string, query: string | undefined, caseSensitive: boolean): boolean {
  if (!query) {
    return true
  }

  return includesWithCase(line, query, caseSensitive)
}

function lineMatchesScope(line: string, scope: string | undefined, caseSensitive: boolean): boolean {
  if (!scope) {
    return true
  }

  try {
    const parsed = JSON.parse(line) as { scope?: unknown }
    if (typeof parsed.scope === 'string') {
      return includesWithCase(parsed.scope, scope, caseSensitive)
    }
  } catch {
    // Plain-text logs still get a raw-line fallback.
  }

  return includesWithCase(line, scope, caseSensitive)
}

function buildLinesWindow(lines: string[], startLine: number, endLine: number) {
  return lines.slice(startLine - 1, endLine).map((text, index) => ({
    line: startLine + index,
    text
  }))
}

function buildTailBlock(lines: string[], tailLines: number): LogSearchBlock {
  const totalLines = lines.length
  const startLine = Math.max(1, totalLines - tailLines + 1)
  const endLine = totalLines

  return {
    start_line: startLine,
    end_line: endLine,
    lines: buildLinesWindow(lines, startLine, endLine)
  }
}

function buildMergedBlocks(
  lines: string[],
  matchLines: number[],
  contextBefore: number,
  contextAfter: number
): LogSearchBlock[] {
  const merged: Array<{ startLine: number; endLine: number; matchLines: number[] }> = []

  for (const matchLine of matchLines) {
    const startLine = Math.max(1, matchLine - contextBefore)
    const endLine = Math.min(lines.length, matchLine + contextAfter)
    const previous = merged[merged.length - 1]

    if (previous && startLine <= previous.endLine + 1) {
      previous.endLine = Math.max(previous.endLine, endLine)
      previous.matchLines.push(matchLine)
      continue
    }

    merged.push({
      startLine,
      endLine,
      matchLines: [matchLine]
    })
  }

  return merged.map(block => ({
    start_line: block.startLine,
    end_line: block.endLine,
    match_lines: block.matchLines,
    lines: buildLinesWindow(lines, block.startLine, block.endLine)
  }))
}

function limitBlocksByTotalLines(blocks: LogSearchBlock[], maxTotalLines: number): {
  blocks: LogSearchBlock[]
  truncated: boolean
} {
  if (blocks.length === 0) {
    return { blocks, truncated: false }
  }

  let remaining = maxTotalLines
  const kept: LogSearchBlock[] = []

  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index]
    const lineCount = block.lines.length

    if (lineCount > remaining) {
      if (kept.length === 0) {
        const trimmedLines = block.lines.slice(-remaining)
        kept.unshift({
          ...block,
          start_line: trimmedLines[0]?.line ?? block.start_line,
          lines: trimmedLines,
          match_lines: block.match_lines?.filter(line => trimmedLines.some(item => item.line === line))
        })
      }
      return {
        blocks: kept,
        truncated: true
      }
    }

    kept.unshift(block)
    remaining -= lineCount

    if (remaining === 0) {
      return {
        blocks: kept,
        truncated: index > 0
      }
    }
  }

  return {
    blocks: kept,
    truncated: false
  }
}

export async function processLogSearch(args: LogSearchArgs): Promise<LogSearchResponse> {
  const target = args.target
  const date = normalizeOptionalText(args.date) ?? logFileManager.getDateKey()

  if (target !== 'app' && target !== 'perf') {
    return {
      success: false,
      target,
      date,
      error: 'target must be either "app" or "perf"'
    }
  }

  if (!isValidDateKey(date)) {
    return {
      success: false,
      target,
      date,
      error: 'date must be a valid YYYY-MM-DD value'
    }
  }

  const query = normalizeOptionalText(args.query)
  const scope = normalizeOptionalText(args.scope)
  const tailLines = clampPositiveInteger(args.tail_lines, DEFAULT_TAIL_LINES, MAX_TAIL_LINES)
  const contextBefore = clampNonNegativeInteger(args.context_before, DEFAULT_CONTEXT_BEFORE, MAX_CONTEXT_LINES)
  const contextAfter = clampNonNegativeInteger(args.context_after, DEFAULT_CONTEXT_AFTER, MAX_CONTEXT_LINES)
  const maxMatches = clampPositiveInteger(args.max_matches, DEFAULT_MAX_MATCHES, MAX_MATCHES)
  const caseSensitive = args.case_sensitive === true

  try {
    const filePath = await resolveLogFile(target, date)
    if (!filePath) {
      const availableFiles = await listRecentAvailableLogFiles(target)
      return {
        success: false,
        target,
        date,
        available_files: availableFiles,
        error: `Log file not found for ${target}-${date}`
      }
    }

    const content = await readLogFile(filePath)
    const lines = splitLines(content)
    const fileName = basename(filePath)

    if (!query && !scope) {
      const block = buildTailBlock(lines, tailLines)
      return {
        success: true,
        target,
        date,
        file_name: fileName,
        total_lines: lines.length,
        total_matches: 0,
        returned_blocks: lines.length > 0 ? 1 : 0,
        truncated: lines.length > block.lines.length,
        blocks: lines.length > 0 ? [block] : []
      }
    }

    const matchLines: number[] = []
    for (const [index, line] of lines.entries()) {
      const lineNumber = index + 1
      if (!lineMatchesQuery(line, query, caseSensitive)) {
        continue
      }
      if (!lineMatchesScope(line, scope, caseSensitive)) {
        continue
      }
      matchLines.push(lineNumber)
    }

    const selectedMatchLines = matchLines.slice(-maxMatches)
    const blocks = buildMergedBlocks(lines, selectedMatchLines, contextBefore, contextAfter)
    const limitedBlocks = limitBlocksByTotalLines(blocks, MAX_TOTAL_RETURNED_LINES)

    logger.info('log_search.completed', {
      target,
      date,
      fileName,
      totalLines: lines.length,
      totalMatches: matchLines.length,
      returnedBlocks: limitedBlocks.blocks.length
    })

    return {
      success: true,
      target,
      date,
      file_name: fileName,
      total_lines: lines.length,
      total_matches: matchLines.length,
      returned_blocks: limitedBlocks.blocks.length,
      truncated: matchLines.length > selectedMatchLines.length || limitedBlocks.truncated,
      blocks: limitedBlocks.blocks
    }
  } catch (error: any) {
    logger.error('log_search.failed', {
      target,
      date,
      error: error?.message ?? String(error)
    })

    return {
      success: false,
      target,
      date,
      error: error?.message ?? 'Failed to inspect log file'
    }
  }
}
