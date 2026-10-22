import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillService } from '@main/services/skills/SkillService'
import { SkillsPromptProvider } from '../SkillsPromptProvider'

vi.mock('@main/services/skills/SkillService', () => ({
  SkillService: {
    listSkills: vi.fn(),
    getSkillContent: vi.fn()
  }
}))

describe('SkillsPromptProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a skills prompt from available metadata without reading loaded skill content', async () => {
    vi.mocked(SkillService.listSkills).mockResolvedValue([
      {
        name: 'pdf-processing',
        description: 'Handle PDFs.'
      }
    ])

    const prompt = await new SkillsPromptProvider().build()

    expect(prompt).toContain('Available Skills')
    expect(prompt).toContain('- pdf-processing: Handle PDFs.')
    expect(prompt).not.toContain('Loaded Skills')
    expect(SkillService.getSkillContent).not.toHaveBeenCalled()
  })

  it('returns empty prompt when no skills are available', async () => {
    vi.mocked(SkillService.listSkills).mockResolvedValue([])

    await expect(new SkillsPromptProvider().build()).resolves.toBe('')
  })
})
