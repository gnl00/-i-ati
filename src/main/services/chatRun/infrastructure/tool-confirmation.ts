import type {
  ToolConfirmationDecision,
  ToolConfirmationRequest
} from '@main/services/agentCore/contracts'
import type { ChatRunEventEmitter } from './event-emitter'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
export type { ToolConfirmationDecision, ToolConfirmationRequest } from '@main/services/agentCore/contracts'

type PendingConfirmation = {
  promise: Promise<ToolConfirmationDecision>
  resolve: (decision: ToolConfirmationDecision) => void
  timeoutId: NodeJS.Timeout
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

export class ToolConfirmationManager {
  private readonly pending = new Map<string, PendingConfirmation>()

  async request(
    emitter: ChatRunEventEmitter,
    request: ToolConfirmationRequest
  ): Promise<ToolConfirmationDecision> {
    const existing = this.pending.get(request.toolCallId)
    if (existing) {
      return existing.promise
    }

    let resolvePromise: (decision: ToolConfirmationDecision) => void
    const promise = new Promise<ToolConfirmationDecision>((resolve) => {
      resolvePromise = resolve
    })

    const timeoutId = setTimeout(() => {
      this.pending.delete(request.toolCallId)
      resolvePromise({
        approved: false,
        reason: 'timeout'
      })
    }, DEFAULT_TIMEOUT_MS)

    this.pending.set(request.toolCallId, {
      promise,
      resolve: resolvePromise!,
      timeoutId
    })

    emitter.emit(CHAT_RUN_EVENTS.TOOL_EXEC_REQUIRES_CONFIRMATION, {
      toolCallId: request.toolCallId,
      name: request.name,
      args: request.args,
      ui: request.ui,
      agent: request.agent
    })

    return promise
  }

  resolve(toolCallId: string, decision: ToolConfirmationDecision): void {
    const pending = this.pending.get(toolCallId)
    if (!pending) {
      return
    }
    clearTimeout(pending.timeoutId)
    this.pending.delete(toolCallId)
    pending.resolve(decision)
  }
}
