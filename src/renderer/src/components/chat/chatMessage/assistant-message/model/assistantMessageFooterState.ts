import { shouldShowAssistantMessageOperations } from '../assistant-message-visibility'

export interface AssistantMessageFooterStateInput {
  committedMessage: ChatMessage
  isLatest: boolean
  isOverlayPreview: boolean
}

export interface AssistantMessageFooterState {
  showOperations: boolean
  showRegenerate: boolean
}

export function buildAssistantMessageFooterState(
  input: AssistantMessageFooterStateInput
): AssistantMessageFooterState {
  return {
    showOperations: shouldShowAssistantMessageOperations({
      messageSource: input.committedMessage.source,
      hasPreviewMessage: input.isOverlayPreview
    }),
    showRegenerate: input.isLatest
  }
}
