import { app } from 'electron'
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { gzip as gzipCallback } from 'zlib'
import { promisify } from 'util'

const gzip = promisify(gzipCallback)
const LOG_FILE_PREFIX = 'app-'
const PERF_LOG_FILE_PREFIX = 'perf-'
const LOG_FILE_SUFFIX = '.log'
const LOG_FILE_GZIP_SUFFIX = '.log.gz'

function toDateKey(input: Date): string {
  const year = input.getFullYear()
  const month = `${input.getMonth() + 1}`.padStart(2, '0')
  const day = `${input.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function extractDateKey(fileName: string): string | null {
  if (!fileName.startsWith(LOG_FILE_PREFIX)) return null
  if (fileName.endsWith(LOG_FILE_SUFFIX)) {
    return fileName.slice(LOG_FILE_PREFIX.length, -LOG_FILE_SUFFIX.length)
  }
  if (fileName.endsWith(LOG_FILE_GZIP_SUFFIX)) {
    return fileName.slice(LOG_FILE_PREFIX.length, -LOG_FILE_GZIP_SUFFIX.length)
  }
  return null
}

function extractPerfDateKey(fileName: string): string | null {
  if (!fileName.startsWith(PERF_LOG_FILE_PREFIX)) return null
  if (fileName.endsWith(LOG_FILE_SUFFIX)) {
    return fileName.slice(PERF_LOG_FILE_PREFIX.length, -LOG_FILE_SUFFIX.length)
  }
  if (fileName.endsWith(LOG_FILE_GZIP_SUFFIX)) {
    return fileName.slice(PERF_LOG_FILE_PREFIX.length, -LOG_FILE_GZIP_SUFFIX.length)
  }
  return null
}

export class LogFileManager {
  constructor(
    private readonly retainDays = 7
  ) {}

  getDateKey(input = new Date()): string {
    return toDateKey(input)
  }

  getLogsDir(): string {
    const baseDir = app.isReady() ? app.getPath('userData') : process.cwd()
    return path.join(baseDir, 'logs')
  }

  getLogFilePath(dateKey = this.getDateKey()): string {
    return path.join(this.getLogsDir(), `${LOG_FILE_PREFIX}${dateKey}${LOG_FILE_SUFFIX}`)
  }

  getPerfLogFilePath(dateKey = this.getDateKey()): string {
    return path.join(this.getLogsDir(), `${PERF_LOG_FILE_PREFIX}${dateKey}${LOG_FILE_SUFFIX}`)
  }

  async ensureLogsDir(): Promise<string> {
    const logsDir = this.getLogsDir()
    await mkdir(logsDir, { recursive: true })
    return logsDir
  }

  async compressAndCleanup(currentDateKey = this.getDateKey()): Promise<void> {
    const logsDir = await this.ensureLogsDir()
    const files = await readdir(logsDir)

    for (const fileName of files) {
      if (!fileName.startsWith(LOG_FILE_PREFIX) && !fileName.startsWith(PERF_LOG_FILE_PREFIX)) continue

      const dateKey = fileName.startsWith(LOG_FILE_PREFIX)
        ? extractDateKey(fileName)
        : extractPerfDateKey(fileName)
      if (!dateKey) continue

      const absolutePath = path.join(logsDir, fileName)
      const ageInDays = this.calculateAgeInDays(dateKey, currentDateKey)

      if (fileName.endsWith(LOG_FILE_SUFFIX) && dateKey !== currentDateKey) {
        await this.gzipLogFile(absolutePath)
        continue
      }

      if (ageInDays > this.retainDays) {
        await rm(absolutePath, { force: true })
      }
    }
  }

  private calculateAgeInDays(dateKey: string, currentDateKey: string): number {
    const currentDate = new Date(`${currentDateKey}T00:00:00`)
    const targetDate = new Date(`${dateKey}T00:00:00`)
    return Math.floor((currentDate.getTime() - targetDate.getTime()) / 86400000)
  }

  private async gzipLogFile(sourcePath: string): Promise<void> {
    const targetPath = `${sourcePath}.gz`

    try {
      await stat(targetPath)
      await unlink(sourcePath)
      return
    } catch {
      // target does not exist yet
    }

    const content = await readFile(sourcePath)
    const compressed = await gzip(content)
    await writeFile(targetPath, compressed)
    await unlink(sourcePath)
  }
}
