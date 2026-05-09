import { beforeEach, describe, expect, it, vi } from 'vitest'
import DatabaseService from '@main/db/DatabaseService'
import { SkillService } from '@main/services/skills/SkillService'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { LoadedSkillsContextProvider } from '../LoadedSkillsContextProvider'

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getSkills: vi.fn()
  }
}))

vi.mock('@main/services/skills/SkillService', () => ({
  SkillService: {
    getSkillContent: vi.fn()
  }
}))

describe('LoadedSkillsContextProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a hidden user message from chat loaded skills', async () => {
    vi.mocked(DatabaseService.getSkills).mockReturnValue(['frontend-design'])
    vi.mocked(SkillService.getSkillContent).mockResolvedValue('Use frontend workflow.')

    const message = await new LoadedSkillsContextProvider().build(7)

    expect(message).toMatchObject({
      role: 'user',
      source: MESSAGE_SOURCE.SKILLS_CONTEXT,
      segments: []
    })
    expect(message?.content).toContain('<loaded_skills_context>')
    expect(message?.content).toContain('<skill name="frontend-design">')
    expect(message?.content).toContain('Use frontend workflow.')
  })

  it('returns null when the chat has no loaded skills', async () => {
    vi.mocked(DatabaseService.getSkills).mockReturnValue([])

    await expect(new LoadedSkillsContextProvider().build(7)).resolves.toBeNull()
  })
})
