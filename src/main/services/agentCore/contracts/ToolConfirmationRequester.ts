export type ToolConfirmationDecision = {
  approved: boolean
  reason?: string
  args?: unknown
}

export type ToolConfirmationRequest = {
  toolCallId: string
  name: string
  args?: unknown
  ui?: {
    title?: string
    riskLevel?: 'risky' | 'dangerous'
    reason?: string
    command?: string
    executionReason?: string
    possibleRisk?: string
    riskScore?: number
  }
}

export interface ToolConfirmationRequester {
  request(request: ToolConfirmationRequest): Promise<ToolConfirmationDecision>
}
