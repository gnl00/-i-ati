import { buildEmotionSystemPrompt } from '@shared/prompts'

export class EmotionPromptProvider {
  build(): string {
    return buildEmotionSystemPrompt()
  }
}
