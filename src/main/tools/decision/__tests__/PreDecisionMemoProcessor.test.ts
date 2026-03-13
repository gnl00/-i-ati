import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import os from 'os'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import { processPreDecisionMemoCreate } from '../PreDecisionMemoProcessor'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath || '/tmp')
  }
}))

describe('PreDecisionMemoProcessor', () => {
  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'pre-decision-memo-test-'))
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
  })

  it('returns explicit error when action is missing', async () => {
    const res = await processPreDecisionMemoCreate({
      action: '',
      trigger: 'user request',
      value_score: 6,
      confidence: 7,
      main_risk: 'unknown dependency',
      user_authorization_needed: false
    })

    expect(res.success).toBe(false)
    expect(res.reason).toBe('missing required param: action')
  })

  it('returns APPROVED and writes log for normal decision', async () => {
    const res = await processPreDecisionMemoCreate({
      action: 'Run static analysis',
      trigger: 'User asked for diagnostics',
      value_score: 7,
      confidence: 8,
      main_risk: 'minor false positives',
      user_authorization_needed: false,
      mitigation: 'Scope checks to changed files',
      chat_uuid: 'chat-1'
    })

    expect(res.success).toBe(true)
    expect(res.status).toBe('APPROVED')
    expect(res.requires_user_confirmation).toBe(false)
    expect(res.file_path).toBeDefined()
    expect(existsSync(res.file_path!)).toBe(true)

    const content = await fs.readFile(res.file_path!, 'utf-8')
    expect(content).toContain('Run static analysis')
    expect(content).toContain('status: APPROVED')
    expect(content).toContain(res.memo_id!)
  })

  it('returns FLAGGED when confidence is low', async () => {
    const res = await processPreDecisionMemoCreate({
      action: 'Publish technical opinion post',
      trigger: 'User asked to continue exploration',
      value_score: 6,
      confidence: 4,
      main_risk: 'content quality mismatch',
      user_authorization_needed: false,
      mitigation: 'Draft and review with user first'
    })

    expect(res.success).toBe(true)
    expect(res.status).toBe('FLAGGED')
    expect(res.requires_user_confirmation).toBe(true)
    expect(res.reason).toContain('CONFIDENCE_LOW')
  })

  it('returns BLOCKED when risk is high and mitigation is missing', async () => {
    const res = await processPreDecisionMemoCreate({
      action: 'Execute destructive command',
      trigger: 'Need to clean old build artifacts',
      value_score: 8,
      confidence: 5,
      main_risk: 'May remove needed files',
      user_authorization_needed: false
    })

    expect(res.success).toBe(true)
    expect(res.status).toBe('BLOCKED')
    expect(res.requires_user_confirmation).toBe(false)
    expect(res.reason).toContain('High risk')
  })
})
