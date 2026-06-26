import DatabaseService from '@main/db/DatabaseService'
import { buildEmotionStateSummary } from '@main/services/emotion/EmotionPromptSummary'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { buildEmotionContextContent, buildEmotionSystemPrompt } from '@shared/prompts'

export class EmotionPromptProvider {
  build(): string {
    return buildEmotionSystemPrompt()
  }

  buildContext(chatId?: number): ChatMessage | null {
    const content = buildEmotionContextContent(this.buildSummary(chatId))
    if (!content.trim()) {
      return null
    }

    return {
      role: 'user',
      source: MESSAGE_SOURCE.EMOTION_CONTEXT,
      content,
      segments: []
    }
  }

  private buildSummary(chatId?: number): string {
    const state = chatId
      ? DatabaseService.getEmotionStateByChatId(chatId)
      : undefined

    return buildEmotionStateSummary(state)
  }
}
