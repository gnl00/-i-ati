import { buildSoulSystemPrompt } from '@shared/prompts/soul'
import { soulService } from '@main/services/SoulService'

export class SoulPromptProvider {
  build(): string {
    return buildSoulSystemPrompt(soulService.getSoul().content)
  }
}
