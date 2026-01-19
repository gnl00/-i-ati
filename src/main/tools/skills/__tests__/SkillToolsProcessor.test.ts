import { describe, expect, it, vi, beforeEach } from 'vitest'
import { processUnloadSkill } from '../main/SkillToolsProcessor'
import DatabaseService from '@main/services/DatabaseService'

vi.mock('@main/services/DatabaseService', () => ({
  default: {
    getChatByUuid: vi.fn(),
    removeChatSkill: vi.fn()
  }
}))

describe('SkillToolsProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(DatabaseService.removeChatSkill).toHaveBeenCalledWith(1, 'pdf-processing')
  })
})
