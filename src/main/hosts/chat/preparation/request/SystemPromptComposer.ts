import { systemPrompt as systemPromptBuilder } from '@shared/prompts'
import { EmotionPromptProvider } from './EmotionPromptProvider'
import { SoulPromptProvider } from './SoulPromptProvider'
import { SkillsPromptProvider } from './SkillsPromptProvider'
import { UserInfoPromptProvider } from './UserInfoPromptProvider'

export class SystemPromptComposer {
  constructor(
    private readonly userInfoPromptProvider = new UserInfoPromptProvider(),
    private readonly skillsPromptProvider = new SkillsPromptProvider(),
    private readonly emotionPromptProvider = new EmotionPromptProvider(),
    private readonly soulPromptProvider = new SoulPromptProvider()
  ) {}

  async compose(chatId?: number): Promise<string[]> {
    const baseSystemPrompt = systemPromptBuilder()
    const userInfoPrompt = await this.userInfoPromptProvider.build()
    const skillsPrompt = await this.skillsPromptProvider.build(chatId)
    const emotionPrompt = this.emotionPromptProvider.build()
    const soulPrompt = this.soulPromptProvider.build()
    const composedSystemPrompt = [
      baseSystemPrompt,
      soulPrompt,
      skillsPrompt,
      userInfoPrompt,
      emotionPrompt
    ]
      .filter(part => part.trim().length > 0)
      .join('\n\n')

    return [composedSystemPrompt]
  }
}
