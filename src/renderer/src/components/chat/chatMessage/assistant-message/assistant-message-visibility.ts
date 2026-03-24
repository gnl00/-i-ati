export interface AssistantMessageVisibilityInput {
  hasContent: boolean
  hasSegments: boolean
  hasToolCalls: boolean
  isCommandConfirmPending: boolean
  isLatest: boolean
  readStreamState: boolean
  showLoadingIndicator: boolean
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
    readStreamState,
    showLoadingIndicator,
  } = input

  if (hasContent || hasSegments || !hasToolCalls) {
    return true
  }

  if (isCommandConfirmPending) {
    return true
  }

  if (isLatest && (readStreamState || showLoadingIndicator)) {
    return true
  }

  return false
}
