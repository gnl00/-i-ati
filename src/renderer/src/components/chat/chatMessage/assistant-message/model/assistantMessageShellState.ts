import { shouldRenderAssistantMessageShell } from '../assistant-message-visibility'
import { buildAssistantMessageFacts } from './assistantMessageFacts'

export interface AssistantMessageShellStateInput {
  committedMessage: ChatMessage
  previewMessage?: ChatMessage
  isLatest: boolean
  isResponseActive: boolean
  isCommandConfirmPending: boolean
}

export interface AssistantMessageShellState {
  shouldRender: boolean
}

export function buildAssistantMessageShellState(
  input: AssistantMessageShellStateInput
): AssistantMessageShellState {
  const {
    committedMessage,
    previewMessage,
    isLatest,
    isResponseActive,
    isCommandConfirmPending
  } = input

  const facts = buildAssistantMessageFacts({
    committedMessage,
    previewMessage
  })

  return {
    shouldRender: shouldRenderAssistantMessageShell({
      hasContent: facts.presence.hasContent,
      hasSegments: facts.presence.hasSegments,
      hasToolCalls: facts.presence.hasToolCalls,
      isCommandConfirmPending,
      isLatest,
      isResponseActive
    })
  }
}
