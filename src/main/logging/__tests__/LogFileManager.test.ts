import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, stat } from 'fs/promises'
import { writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { LogFileManager } from '../LogFileManager'

class TestLogFileManager extends LogFileManager {
  constructor(
    private readonly logsDir: string,
    retainDays: number
  ) {
    super(retainDays)
  }

  override getLogsDir(): string {
    return this.logsDir
  }
}

describe('LogFileManager', () => {
  let tempDir = ''

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  it('compresses previous day logs and removes expired archives', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ati-log-manager-'))
    const manager = new TestLogFileManager(tempDir, 2)

    writeFileSync(path.join(tempDir, 'app-2026-03-19.log'), 'yesterday')
    writeFileSync(path.join(tempDir, 'scheduler-2026-03-19.log'), 'scheduler-yesterday')
    writeFileSync(path.join(tempDir, 'request-2026-03-19.log'), 'request-yesterday')
    writeFileSync(path.join(tempDir, 'app-2026-03-17.log.gz'), 'old')
    writeFileSync(path.join(tempDir, 'scheduler-2026-03-17.log.gz'), 'scheduler-old')
    writeFileSync(path.join(tempDir, 'request-2026-03-17.log.gz'), 'request-old')
    writeFileSync(path.join(tempDir, 'app-2026-03-20.log'), 'today')
    writeFileSync(path.join(tempDir, 'scheduler-2026-03-20.log'), 'scheduler-today')
    writeFileSync(path.join(tempDir, 'request-2026-03-20.log'), 'request-today')

    await manager.compressAndCleanup('2026-03-20')

    const files = await readdir(tempDir)
    expect(files).toContain('app-2026-03-19.log.gz')
    expect(files).toContain('scheduler-2026-03-19.log.gz')
    expect(files).toContain('request-2026-03-19.log.gz')
    expect(files).toContain('app-2026-03-20.log')
    expect(files).toContain('scheduler-2026-03-20.log')
    expect(files).toContain('request-2026-03-20.log')
    expect(files).not.toContain('app-2026-03-19.log')
    expect(files).not.toContain('scheduler-2026-03-19.log')
    expect(files).not.toContain('request-2026-03-19.log')
    expect(files).not.toContain('app-2026-03-17.log.gz')
    expect(files).not.toContain('scheduler-2026-03-17.log.gz')
    expect(files).not.toContain('request-2026-03-17.log.gz')

    const gzStat = await stat(path.join(tempDir, 'app-2026-03-19.log.gz'))
    expect(gzStat.size).toBeGreaterThan(0)
  })
})
