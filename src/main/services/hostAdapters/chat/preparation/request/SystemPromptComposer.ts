import {
  buildUserInstructionPrompt,
  systemPrompt as systemPromptBuilder
} from '@shared/prompts'
import { SoulPromptProvider } from './SoulPromptProvider'
import { SkillsPromptProvider } from './SkillsPromptProvider'

export class SystemPromptComposer {
  constructor(
    private readonly skillsPromptProvider = new SkillsPromptProvider(),
    private readonly soulPromptProvider = new SoulPromptProvider()
  ) {}

  async compose(
    workspacePath: string,
    chatId?: number,
    userInstruction?: string
  ): Promise<string[]> {
    const baseSystemPrompt = systemPromptBuilder(workspacePath)
    const skillsPrompt = await this.skillsPromptProvider.build(chatId)
    const soulPrompt = this.soulPromptProvider.build()
    const userInstructionPrompt = buildUserInstructionPrompt(userInstruction)

    const composedSystemPrompt = [
      baseSystemPrompt,
      skillsPrompt,
      soulPrompt,
      userInstructionPrompt
    ]
      .filter(part => part.trim().length > 0)
      .join('\n\n')

    return [composedSystemPrompt]
  }
}
