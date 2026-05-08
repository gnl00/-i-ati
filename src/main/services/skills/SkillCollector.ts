import { execFile } from 'child_process'
import path from 'path'
import * as fs from 'fs/promises'
import { promisify } from 'util'
import { SKILL_FILE } from './SkillParser'

export type ArchiveType = 'zip' | 'tar' | 'targz'

const execFileAsync = promisify(execFile)
const COMMAND_TIMEOUT_MS = 30_000
const FETCH_TIMEOUT_MS = 60_000

export const isUrl = (value: string): boolean => /^https?:\/\//i.test(value)

export const getArchiveType = (source: string): ArchiveType | null => {
  const pathname = isUrl(source) ? new URL(source).pathname : source
  const lower = pathname.toLowerCase()
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'targz'
  if (lower.endsWith('.tar')) return 'tar'
  if (lower.endsWith('.zip')) return 'zip'
  return null
}

const runCommand = async (
  command: string,
  args: string[],
  timeoutMs = COMMAND_TIMEOUT_MS
): Promise<string> => {
  try {
    const result = await execFileAsync(command, args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs
    })
    return result.stdout?.toString() || ''
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      const joined = [command, ...args].join(' ')
      throw new Error(`Command not available: ${joined}`)
    }
    if (error?.killed || error?.signal === 'SIGTERM') {
      const joined = [command, ...args].join(' ')
      throw new Error(`Command timed out after ${timeoutMs}ms: ${joined}`)
    }
    throw error
  }
}

const tryCommand = async (command: string, args: string[]): Promise<string | null> => {
  try {
    return await runCommand(command, args)
  } catch (error: any) {
    if (error?.message?.startsWith('Command not available')) {
      return null
    }
    throw error
  }
}

const isUnsafeArchivePath = (entry: string): boolean => {
  const normalized = entry.replace(/\\/g, '/')
  if (!normalized) return false
  if (normalized.startsWith('/') || normalized.startsWith('\\')) return true
  if (/^[A-Za-z]:/.test(normalized)) return true
  if (normalized.includes('..')) {
    const parts = normalized.split('/')
    if (parts.includes('..')) return true
  }
  return false
}

const listArchiveEntries = async (archivePath: string, type: ArchiveType): Promise<string[]> => {
  if (type === 'zip') {
    const output = await tryCommand('unzip', ['-Z', '-1', archivePath])
    if (output !== null) {
      return output.split(/\r?\n/).filter(Boolean)
    }
    const tarOutput = await runCommand('tar', ['-tf', archivePath])
    return tarOutput.split(/\r?\n/).filter(Boolean)
  }

  const args = type === 'targz' ? ['-tzf', archivePath] : ['-tf', archivePath]
  const output = await runCommand('tar', args)
  return output.split(/\r?\n/).filter(Boolean)
}

export const extractArchive = async (
  archivePath: string,
  destDir: string,
  type: ArchiveType
): Promise<void> => {
  const entries = await listArchiveEntries(archivePath, type)
  const hasUnsafe = entries.some(isUnsafeArchivePath)
  if (hasUnsafe) {
    throw new Error('Archive contains unsafe paths')
  }

  if (type === 'zip') {
    const unzipOutput = await tryCommand('unzip', ['-q', archivePath, '-d', destDir])
    if (unzipOutput !== null) {
      return
    }
    await runCommand('tar', ['-xf', archivePath, '-C', destDir])
    return
  }

  if (type === 'targz') {
    await runCommand('tar', ['-xzf', archivePath, '-C', destDir])
    return
  }

  await runCommand('tar', ['-xf', archivePath, '-C', destDir])
}

export const findSkillDirectories = async (rootDir: string, maxDepth = 5): Promise<string[]> => {
  const results: string[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    const entries = await fs.readdir(current.dir, { withFileTypes: true })
    const hasSkill = entries.some(entry => entry.isFile() && entry.name === SKILL_FILE)
    if (hasSkill) {
      results.push(current.dir)
      continue
    }

    if (current.depth >= maxDepth) {
      continue
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 })
      }
    }
  }

  return results
}

const createTimeoutSignal = (timeoutMs: number): {
  signal: AbortSignal
  dispose: () => void
} => {
  const timeout = (AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal
  }).timeout
  if (timeout) {
    return {
      signal: timeout(timeoutMs),
      dispose: () => undefined
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer)
  }
}

const readFetchResponseWithTimeout = async <T>(
  url: string,
  read: (response: Response) => Promise<T>,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<T> => {
  const { signal, dispose } = createTimeoutSignal(timeoutMs)
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) {
      throw new Error(`Failed to fetch skill from URL: ${response.status} ${response.statusText}`)
    }
    return await read(response)
  } catch (error: any) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new Error(`Fetch timed out after ${timeoutMs}ms: ${url}`)
    }
    throw error
  } finally {
    dispose()
  }
}

export const fetchUrlText = async (url: string, timeoutMs?: number): Promise<string> => {
  return await readFetchResponseWithTimeout(url, response => response.text(), timeoutMs)
}

export const fetchUrlToFile = async (
  url: string,
  destPath: string,
  timeoutMs?: number
): Promise<void> => {
  const buffer = await readFetchResponseWithTimeout(
    url,
    async response => Buffer.from(await response.arrayBuffer()),
    timeoutMs
  )
  await fs.writeFile(destPath, buffer)
}
