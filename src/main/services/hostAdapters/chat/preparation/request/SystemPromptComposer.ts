import DatabaseService from '@main/services/DatabaseService'
import { SkillService } from '@main/services/skills/SkillService'
import { systemPrompt as systemPromptBuilder } from '@shared/prompts'
import { buildSkillsPrompt } from '@shared/services/skills/SkillPromptBuilder'

export class SystemPromptComposer {
  async compose(
    workspacePath: string,
    chatId?: number,
    prompt?: string
  ): Promise<string[]> {
    const defaultSystemPrompt = systemPromptBuilder(workspacePath)
    const skillsPrompt = await this.buildSkillsPrompt(chatId)

    const skillSlotToken = '$$skill-slot$$'
    const userInstructionSlotToken = '$$user-instruction-slot$$'

    let composedSystemPrompt = defaultSystemPrompt
    composedSystemPrompt = composedSystemPrompt.includes(skillSlotToken)
      ? composedSystemPrompt.replace(skillSlotToken, skillsPrompt)
      : `${composedSystemPrompt}${skillsPrompt}`

    composedSystemPrompt = composedSystemPrompt.includes(userInstructionSlotToken)
      ? composedSystemPrompt.replace(userInstructionSlotToken, '')
      : composedSystemPrompt

    if (prompt) {
      return [prompt, composedSystemPrompt]
    }

    return [composedSystemPrompt]
  }

  private async buildSkillsPrompt(chatId?: number): Promise<string> {
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

      return buildSkillsPrompt(
        availableSkills,
        loadedSkills.filter(Boolean) as { name: string; content: string }[]
      )
    } catch (error) {
      console.warn('[Skills] Failed to build skills prompt:', error)
      return ''
    }
  }
}
