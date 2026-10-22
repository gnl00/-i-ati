import type { AgentRequestSpec } from '@main/agent/contracts/HostRuntimeContracts'
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

  async compose(emotionEnabled = true, onMeasure?: (parts: NonNullable<AgentRequestSpec['systemPromptParts']>) => void): Promise<string[]> {
    const baseSystemPrompt = systemPromptBuilder()
    const userInfoPrompt = await this.userInfoPromptProvider.build()
    const skillsPrompt = await this.skillsPromptProvider.build()
    const emotionPrompt = emotionEnabled ? this.emotionPromptProvider.build() : ''
    const soulPrompt = this.soulPromptProvider.build()
    onMeasure?.(Object.fromEntries(Object.entries({ policy: baseSystemPrompt, soul: soulPrompt, skillCatalog: skillsPrompt, userPolicy: userInfoPrompt, emotionPolicy: emotionPrompt })
      .map(([name, text]) => [name, { characters: text.length, utf8Bytes: Buffer.byteLength(text) }])))
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
