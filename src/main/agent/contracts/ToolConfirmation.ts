import type { ToolConfirmation, TelegramConfirmationTarget, ToolConfirmationDecision, ToolConfirmationRequest } from '@shared/tools/confirmation'
export type { ToolConfirmationDecision, ToolConfirmationRequest } from '@shared/tools/confirmation'

export interface ToolConfirmationRequester {
  request(request: ToolConfirmationRequest): Promise<ToolConfirmationDecision>
}

export type ToolConfirmationListener = (confirmation: ToolConfirmation, targets: readonly TelegramConfirmationTarget[]) => void
