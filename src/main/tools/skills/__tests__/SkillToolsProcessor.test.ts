import { describe, expect, it, vi, beforeEach } from 'vitest'
import { existsSync } from 'fs'
import { processLoadSkill, processUnloadSkill } from '../SkillToolsProcessor'
import DatabaseService from '@main/db/DatabaseService'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/user-data')
  }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getChatByUuid: vi.fn(),
    getSkills: vi.fn(),
    addSkill: vi.fn(),
    removeSkill: vi.fn()
  }
}))

describe('SkillToolsProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(existsSync).mockReturnValue(true)
  })

  it('fails when name is missing', async () => {
    const result = await processUnloadSkill({ name: '', chat_uuid: 'chat-1' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('name is required')
  })

  it('fails when chat_uuid is missing', async () => {
    const result = await processUnloadSkill({ name: 'pdf-processing' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('chat_uuid is required')
  })

  it('fails when chat is not found', async () => {
    vi.mocked(DatabaseService.getChatByUuid).mockReturnValue(undefined)
    const result = await processUnloadSkill({ name: 'pdf-processing', chat_uuid: 'chat-1' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('Chat not found')
  })

  it('removes skill when chat is found', async () => {
    vi.mocked(DatabaseService.getChatByUuid).mockReturnValue({ id: 1 } as ChatEntity)
    const result = await processUnloadSkill({ name: 'pdf-processing', chat_uuid: 'chat-1' })
    expect(result.success).toBe(true)
    expect(DatabaseService.removeSkill).toHaveBeenCalledWith(1, 'pdf-processing')
  })

  it('loads a skill when it is not already loaded for the chat', async () => {
    vi.mocked(DatabaseService.getChatByUuid).mockReturnValue({ id: 1 } as ChatEntity)
    vi.mocked(DatabaseService.getSkills).mockReturnValue(['frontend-design'])

    const result = await processLoadSkill({ name: 'pdf-processing', chat_uuid: 'chat-1' })

    expect(result).toMatchObject({
      success: true,
      name: 'pdf-processing',
      loaded: true
    })
    expect(DatabaseService.getSkills).toHaveBeenCalledWith(1)
    expect(DatabaseService.addSkill).toHaveBeenCalledWith(1, 'pdf-processing')
  })

  it('returns success without inserting when the skill is already loaded for the chat', async () => {
    vi.mocked(DatabaseService.getChatByUuid).mockReturnValue({ id: 1 } as ChatEntity)
    vi.mocked(DatabaseService.getSkills).mockReturnValue(['pdf-processing'])

    const result = await processLoadSkill({ name: 'pdf-processing', chat_uuid: 'chat-1' })

    expect(result).toMatchObject({
      success: true,
      name: 'pdf-processing',
      loaded: true,
      message: 'Skill already loaded.'
    })
    expect(DatabaseService.getSkills).toHaveBeenCalledWith(1)
    expect(DatabaseService.addSkill).toHaveBeenCalledTimes(0)
  })
})
