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
    listSkills: vi.fn(),
    getSkillContent: vi.fn()
  }
}))

describe('LoadedSkillsContextProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a compact hidden user message from chat loaded skill names', async () => {
    vi.mocked(DatabaseService.getSkills).mockReturnValue(['frontend-design', 'hunt'])
    vi.mocked(SkillService.listSkills).mockResolvedValue([
      {
        name: 'frontend-design',
        description: 'Frontend design.',
        path: '/Users/gnl/.agents/skills/frontend-design/SKILL.md'
      },
      {
        name: 'hunt',
        description: 'Bug hunting.'
      }
    ])
    vi.mocked(SkillService.getSkillContent).mockResolvedValue('Use frontend workflow.')

    const message = await new LoadedSkillsContextProvider().build(7)

    expect(message).toMatchObject({
      role: 'user',
      source: MESSAGE_SOURCE.SKILLS_CONTEXT,
      segments: []
    })
    expect(message?.content).toContain('<loaded_skills_context>')
    expect(message?.content).toContain(
      '<skill name="frontend-design" path="/Users/gnl/.agents/skills/frontend-design/SKILL.md" />'
    )
    expect(message?.content).toContain('<skill name="hunt" />')
    expect(message?.content).toContain(
      '<instruction>Read the full skill file before applying a loaded skill.</instruction>'
    )
    expect(message?.content).not.toContain('Use frontend workflow.')
    expect(SkillService.listSkills).toHaveBeenCalledOnce()
    expect(SkillService.getSkillContent).not.toHaveBeenCalled()
  })

  it('escapes XML attributes in loaded skill names and paths', async () => {
    vi.mocked(DatabaseService.getSkills).mockReturnValue(['front&end<design>"'])
    vi.mocked(SkillService.listSkills).mockResolvedValue([
      {
        name: 'front&end<design>"',
        description: 'Frontend design.',
        path: '/tmp/skills/front&end<design>"/SKILL.md'
      }
    ])

    const message = await new LoadedSkillsContextProvider().build(7)

    expect(message?.content).toContain(
      '<skill name="front&amp;end&lt;design&gt;&quot;" path="/tmp/skills/front&amp;end&lt;design&gt;&quot;/SKILL.md" />'
    )
  })

  it('returns null when the chat has no loaded skills', async () => {
    vi.mocked(DatabaseService.getSkills).mockReturnValue([])

    await expect(new LoadedSkillsContextProvider().build(7)).resolves.toBeNull()
    expect(SkillService.listSkills).not.toHaveBeenCalled()
  })
})
