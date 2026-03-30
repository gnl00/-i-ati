export interface AssistantMessageVisibilityInput {
  hasContent: boolean
  hasSegments: boolean
  hasToolCalls: boolean
  isCommandConfirmPending: boolean
  isLatest: boolean
  isResponseActive: boolean
}

export function shouldRenderAssistantMessageShell(
  input: AssistantMessageVisibilityInput
): boolean {
  const {
    hasContent,
    hasSegments,
    hasToolCalls,
    isCommandConfirmPending,
    isLatest,
    isResponseActive,
  } = input

  if (hasContent || hasSegments || !hasToolCalls) {
    return true
  }

  if (isCommandConfirmPending) {
    return true
  }

  if (isLatest && isResponseActive) {
    return true
  }

  return false
}

export interface AssistantMessagePreviewStateInput {
  messageSource?: ChatMessage['source']
  hasPreviewMessage: boolean
}

export function isAssistantStreamPreviewMessage(
  input: AssistantMessagePreviewStateInput
): boolean {
  return input.hasPreviewMessage || input.messageSource === 'stream_preview'
}

export function shouldShowAssistantMessageOperations(
  input: AssistantMessagePreviewStateInput
): boolean {
  return !isAssistantStreamPreviewMessage(input)
}
