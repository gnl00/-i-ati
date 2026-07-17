import { chatDb } from '@main/db/chat'
import { buildEmotionStateSummary } from '@main/services/emotion/EmotionPromptSummary'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { buildEmotionContextContent, buildEmotionSystemPrompt } from '@shared/prompts'

export class EmotionPromptProvider {
  build(): string {
    return buildEmotionSystemPrompt()
  }

  buildContext(_chatId?: number): ChatMessage | null {
    const content = buildEmotionContextContent(this.buildSummary())
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

  private buildSummary(): string {
    const state = chatDb.getEmotionState()

    return buildEmotionStateSummary(state)
  }
}
