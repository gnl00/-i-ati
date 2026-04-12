import DatabaseService from '@main/db/DatabaseService'
import { SkillService } from '@main/services/skills/SkillService'
import { buildSkillsSystemPrompt } from '@shared/prompts'
import { buildSkillsPrompt } from '@shared/services/skills/SkillPromptBuilder'

export class SkillsPromptProvider {
  async build(chatId?: number): Promise<string> {
    try {
      const availableSkills = await SkillService.listSkills()
      const chatSkills = chatId ? DatabaseService.getChatSkills(chatId) : []

      if (availableSkills.length === 0 && chatSkills.length === 0) {
        return ''
      }

      const loadedSkills = await Promise.all(
        chatSkills.map(async (name) => {
          try {
            const content = await SkillService.getSkillContent(name)
            return { name, content }
          } catch (error) {
            console.warn(`[Skills] Failed to load skill content: ${name}`, error)
            return null
          }
        })
      )

      const skillsContext = buildSkillsPrompt(
        availableSkills,
        loadedSkills.filter(Boolean) as { name: string; content: string }[]
      )

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
