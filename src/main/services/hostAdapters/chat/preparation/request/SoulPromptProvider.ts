import { buildSoulSystemPrompt } from '@shared/prompts/soul'

export class SoulPromptProvider {
  build(): string {
    return buildSoulSystemPrompt()
  }
}
