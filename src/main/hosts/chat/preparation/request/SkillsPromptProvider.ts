import { SkillService } from '@main/services/skills/SkillService'
import { buildSkillsSystemPrompt } from '@shared/prompts'
import { buildSkillsPrompt } from '@shared/services/skills/SkillPromptBuilder'

export class SkillsPromptProvider {
  async build(_chatId?: number): Promise<string> {
    try {
      const availableSkills = await SkillService.listSkills()

      if (availableSkills.length === 0) {
        return ''
      }

      const skillsContext = buildSkillsPrompt(availableSkills)

      if (!skillsContext.trim()) {
        return ''
      }

      return buildSkillsSystemPrompt(skillsContext)
    } catch (error) {
      console.warn('[Skills] Failed to build skills prompt:', error)
      return ''
    }
  }
}
