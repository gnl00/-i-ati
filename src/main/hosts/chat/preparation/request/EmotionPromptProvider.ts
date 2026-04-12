import DatabaseService from '@main/db/DatabaseService'
import { buildEmotionStateSummary } from '@main/services/emotion/EmotionPromptSummary'
import { buildEmotionSystemPrompt } from '@shared/prompts'

export class EmotionPromptProvider {
  build(chatId?: number): string {
    const state = chatId
      ? DatabaseService.getEmotionStateByChatId(chatId)
      : undefined

    return buildEmotionSystemPrompt(buildEmotionStateSummary(state))
  }
}
