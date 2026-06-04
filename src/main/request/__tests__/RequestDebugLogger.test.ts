import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { LogFileManager } from '@main/logging/LogFileManager'
import { RequestDebugLogger } from '../RequestDebugLogger'

class TestLogFileManager extends LogFileManager {
  constructor(private readonly logsDir: string) {
    super()
  }

  override getLogsDir(): string {
    return this.logsDir
  }

  override getDateKey(): string {
    return '2026-06-04'
  }
}

describe('RequestDebugLogger', () => {
  let tempDir = ''

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  it('builds readable request body JSON without app-log chunks', () => {
    const body = {
      model: 'test-model',
      messages: [{
        role: 'user',
        content: 'x'.repeat(5000)
      }]
    }
    const serializedBody = JSON.stringify(body)
    const result = RequestDebugLogger.buildBodyLog(body, {
      requestLogId: 'req-1',
      serializedBody
    })

    expect(result.summary.requestLogId).toBe('req-1')
    expect(result.summary.messageCount).toBe(1)
    expect(result.summary.bodySha256).toHaveLength(64)
    expect(result.bodyText).toContain('\n  "messages": [\n')
    expect(result.bodyText).toContain('x'.repeat(5000))
  })

  it('redacts sensitive keys and compresses embedded media payloads', () => {
    const body = {
      apiKey: 'secret',
      messages: [{
        role: 'user',
        content: `see data:image/png;base64,${Buffer.from('image-bytes').toString('base64')}`
      }]
    }
    const serializedBody = JSON.stringify(body)
    const result = RequestDebugLogger.buildBodyLog(body, {
      requestLogId: 'req-2',
      serializedBody
    })

    expect(result.summary.redactionCount).toBe(1)
    expect(result.summary.mediaCount).toBe(1)
    expect(result.bodyText).toContain('"apiKey": "[REDACTED]"')
    expect(result.bodyText).toContain('[media:image/png;base64 bytes=11 sha256=')
    expect(result.bodyText.includes(Buffer.from('image-bytes').toString('base64'))).toBe(false)
  })

  it('caps emitted request body JSON when sanitized content exceeds the limit', () => {
    const body = {
      messages: [{
        role: 'user',
        content: 'x'.repeat(200)
      }]
    }
    const serializedBody = JSON.stringify(body)
    const result = RequestDebugLogger.buildBodyLog(body, {
      requestLogId: 'req-3',
      serializedBody,
      maxBodyChars: 80
    })

    expect(result.summary.truncated).toBe(true)
    expect(result.summary.emittedChars).toBe(80)
    expect(result.summary.omittedChars).toBeGreaterThan(0)
    expect(result.bodyText.length).toBe(80)
  })

  it('writes request blocks to request log files', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ati-request-debug-log-'))
    const logger = new RequestDebugLogger(new TestLogFileManager(tempDir))
    const body = {
      model: 'test-model',
      messages: [{
        role: 'user',
        content: 'debug me'
      }]
    }
    const serializedBody = JSON.stringify(body)

    await logger.writeRequestBody({
      requestLogId: 'req-file-1',
      time: '2026-06-04T10:28:39.429+08:00',
      baseUrl: 'https://example.invalid/v1',
      adapterPluginId: 'openai-chat-compatible-adapter',
      model: 'test-model',
      endpoint: 'https://example.invalid/v1/chat/completions',
      stream: false,
      body,
      serializedBody
    })

    const files = await readFile(path.join(tempDir, 'request-2026-06-04.log'), 'utf8')
    expect(files).toContain('===== request 2026-06-04T10:28:39.429+08:00 requestLogId=req-file-1 =====')
    expect(files).toContain('endpoint: https://example.invalid/v1/chat/completions')
    expect(files).toContain('"content": "debug me"')
    expect(files).toContain('===== end request requestLogId=req-file-1 =====')
  })
})
