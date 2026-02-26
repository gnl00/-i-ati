import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import os from 'os'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import { processWorkingMemoryGet, processWorkingMemorySet } from '../MemoryToolsProcessor'

var userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath || '/tmp')
  }
}))

describe('WorkingMemoryToolsProcessor', () => {
  const chatUuid = 'c06fa90a-436c-46fb-84ff-3d2532cacec1'

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'working-memory-test-'))
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
  })

  it('returns template when working memory file does not exist', async () => {
    const res = await processWorkingMemoryGet({ chat_uuid: chatUuid })
    expect(res.success).toBe(true)
    expect(res.exists).toBe(false)
    expect(res.content).toContain('# Working Memory')
    expect(res.content).toContain('## Current Goal')
  })

  it('writes and reads working memory markdown', async () => {
    const content = [
      '# Working Memory',
      '',
      '## Current Goal',
      'Ship schedule stability fix.',
      '',
      '## Decisions',
      '- Use single subscription per submission.'
    ].join('\n')

    const setRes = await processWorkingMemorySet({
      chat_uuid: chatUuid,
      content
    })

    expect(setRes.success).toBe(true)
    expect(setRes.updated).toBe(true)
    expect(setRes.skipped).toBe(false)
    expect(setRes.file_path).toBeDefined()
    expect(existsSync(setRes.file_path!)).toBe(true)

    const getRes = await processWorkingMemoryGet({ chat_uuid: chatUuid })
    expect(getRes.success).toBe(true)
    expect(getRes.exists).toBe(true)
    expect(getRes.content).toContain('Ship schedule stability fix.')
  })

  it('skips writing when normalized content is unchanged', async () => {
    const original = '# Working Memory\n\n## Current Goal\nStabilize streaming.\n'
    await processWorkingMemorySet({ chat_uuid: chatUuid, content: original })

    const sameWithFormattingNoise = '# Working Memory\r\n\r\n## Current Goal\r\nStabilize streaming.   \r\n\r\n'
    const res = await processWorkingMemorySet({
      chat_uuid: chatUuid,
      content: sameWithFormattingNoise
    })

    expect(res.success).toBe(true)
    expect(res.updated).toBe(false)
    expect(res.skipped).toBe(true)
    expect(res.message).toContain('unchanged')
  })
})
