import {
  buildUserInstructionPrompt,
  systemPrompt as systemPromptBuilder
} from '@shared/prompts'
import { EmotionPromptProvider } from './EmotionPromptProvider'
import { KnowledgebasePromptProvider } from './KnowledgebasePromptProvider'
import { SoulPromptProvider } from './SoulPromptProvider'
import { SkillsPromptProvider } from './SkillsPromptProvider'
import { UserInfoPromptProvider } from './UserInfoPromptProvider'

export class SystemPromptComposer {
  constructor(
    private readonly userInfoPromptProvider = new UserInfoPromptProvider(),
    private readonly skillsPromptProvider = new SkillsPromptProvider(),
    private readonly emotionPromptProvider = new EmotionPromptProvider(),
    private readonly soulPromptProvider = new SoulPromptProvider(),
    private readonly knowledgebasePromptProvider = new KnowledgebasePromptProvider()
  ) {}

  async compose(
    workspacePath: string,
    chatId?: number,
    userInstruction?: string,
    currentQuery?: string
  ): Promise<string[]> {
    const baseSystemPrompt = systemPromptBuilder(workspacePath)
    const userInfoPrompt = await this.userInfoPromptProvider.build()
    const skillsPrompt = await this.skillsPromptProvider.build(chatId)
    const emotionPrompt = this.emotionPromptProvider.build(chatId)
    const soulPrompt = this.soulPromptProvider.build()
    const userInstructionPrompt = buildUserInstructionPrompt(userInstruction)
    const knowledgebasePrompt = await this.knowledgebasePromptProvider.build(currentQuery)
    const composedSystemPrompt = [
      baseSystemPrompt,
      userInfoPrompt,
      skillsPrompt,
      emotionPrompt,
      soulPrompt,
      userInstructionPrompt,
      knowledgebasePrompt
    ]
      .filter(part => part.trim().length > 0)
      .join('\n\n')

    return [composedSystemPrompt]
  }
}
