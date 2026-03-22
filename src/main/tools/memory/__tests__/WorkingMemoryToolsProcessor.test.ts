import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import os from 'os'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import { processWorkContextGet, processWorkContextSet } from '../MemoryToolsProcessor'

var userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath || '/tmp'),
    isReady: vi.fn(() => false)
  }
}))

describe('WorkContextToolsProcessor', () => {
  const chatUuid = 'c06fa90a-436c-46fb-84ff-3d2532cacec1'

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'work-context-test-'))
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
  })

  it('returns template when work context file does not exist', async () => {
    const res = await processWorkContextGet({ chat_uuid: chatUuid })
    expect(res.success).toBe(true)
    expect(res.exists).toBe(false)
    expect(res.content).toContain('# Work Context')
    expect(res.content).toContain('## Current Goal')
  })

  it('returns template content when chat_uuid is missing', async () => {
    const res = await processWorkContextGet({})
    expect(res.success).toBe(false)
    expect(res.exists).toBe(false)
    expect(res.content).toContain('# Work Context')
    expect(res.message).toContain('chat_uuid is required')
  })

  it('writes and reads work context markdown', async () => {
    const content = [
      '# Work Context',
      '',
      '## Current Goal',
      'Ship schedule stability fix.',
      '',
      '## Decisions',
      '- Use single subscription per submission.'
    ].join('\n')

    const setRes = await processWorkContextSet({
      chat_uuid: chatUuid,
      content
    })

    expect(setRes.success).toBe(true)
    expect(setRes.updated).toBe(true)
    expect(setRes.skipped).toBe(false)
    expect(setRes.file_path).toBeDefined()
    expect(existsSync(setRes.file_path!)).toBe(true)

    const getRes = await processWorkContextGet({ chat_uuid: chatUuid })
    expect(getRes.success).toBe(true)
    expect(getRes.exists).toBe(true)
    expect(getRes.content).toContain('Ship schedule stability fix.')
  })

  it('skips writing when normalized content is unchanged', async () => {
    const original = '# Work Context\n\n## Current Goal\nStabilize streaming.\n'
    await processWorkContextSet({ chat_uuid: chatUuid, content: original })

    const sameWithFormattingNoise = '# Work Context\r\n\r\n## Current Goal\r\nStabilize streaming.   \r\n\r\n'
    const res = await processWorkContextSet({
      chat_uuid: chatUuid,
      content: sameWithFormattingNoise
    })

    expect(res.success).toBe(true)
    expect(res.updated).toBe(false)
    expect(res.skipped).toBe(true)
    expect(res.message).toContain('unchanged')
  })

  it('writes template when content is empty', async () => {
    const res = await processWorkContextSet({
      chat_uuid: chatUuid,
      content: '   \n\n  '
    })

    expect(res.success).toBe(true)
    expect(res.updated).toBe(true)
    expect(res.skipped).toBe(false)

    const getRes = await processWorkContextGet({ chat_uuid: chatUuid })
    expect(getRes.success).toBe(true)
    expect(getRes.content).toContain('# Work Context')
    expect(getRes.content).toContain('## Current Goal')
  })

  it('returns validation message when content type is invalid', async () => {
    const res = await processWorkContextSet({
      chat_uuid: chatUuid,
      content: 123 as any
    })

    expect(res.success).toBe(false)
    expect(res.message).toContain('invalid param type: content')
  })

  it('returns missing required param error when content is absent', async () => {
    const res = await processWorkContextSet({
      chat_uuid: chatUuid
    } as any)

    expect(res.success).toBe(false)
    expect(res.message).toBe('missing required param: content')
  })
})
