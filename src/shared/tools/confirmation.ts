import type { AgentConfirmationSource } from './approval'

export type ToolConfirmationDecision = { approved: boolean; reason?: string; args?: unknown }

export type ToolConfirmationRequest = {
  toolCallId: string
  name: string
  args?: unknown
  agent?: AgentConfirmationSource
  ui?: {
    title?: string
    riskLevel?: 'risky' | 'dangerous'
    reason?: string
    command?: string
    executionReason?: string
    possibleRisk?: string
    riskScore?: number
    filesystemScope?: 'workspace' | 'outside_workspace' | 'unknown'
    inferredFilesystemScope?: 'workspace' | 'outside_workspace' | 'unknown'
    filesystemReason?: string
  }
}

export type ToolConfirmationStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled'
export type TelegramConfirmationTarget = { peerId: string; threadId?: string }
export type ToolConfirmationActor =
  | { host: 'chat' | 'tui' }
  | ({ host: 'telegram'; userId?: string } & TelegramConfirmationTarget)
  | { host: 'system'; cause: 'timeout' | 'run_cancelled' | 'auto' }

export type ToolConfirmation = ToolConfirmationRequest & {
  confirmationId: string
  submissionId: string
  chatUuid: string
  createdAt: number
  expiresAt: number
  status: ToolConfirmationStatus
  version: number
  resolvedAt?: number
  resolvedBy?: ToolConfirmationActor
  reason?: string
  decision?: ToolConfirmationDecision
}

export type ToolConfirmationSubmitRequest = ToolConfirmationDecision & Pick<
  ToolConfirmation, 'confirmationId' | 'submissionId' | 'chatUuid' | 'toolCallId'
>

export type ToolConfirmationSubmitResult =
  | { ok: true; confirmation: ToolConfirmation }
  | {
      ok: false
      reason: 'invalid_request' | 'identity_mismatch' | 'not_found' | 'already_resolved'
      confirmation?: ToolConfirmation
    }

export type ToolConfirmationSnapshot = { version: number; confirmations: ToolConfirmation[] }
