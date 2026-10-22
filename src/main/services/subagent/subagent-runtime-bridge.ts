import type { RunEventEmitter, ToolConfirmationDecision, ToolConfirmationRequest, ToolConfirmationRequester } from '@main/agent/contracts'
import { SUBAGENT_EVENTS } from '@shared/subagent/events'
import type { SubagentRecord } from '@tools/subagent/index.d'
import type { AgentRequestSpec } from '@main/agent/contracts/HostRuntimeContracts'

type ParentRuntimeChannel = {
  requester: ToolConfirmationRequester
  emitter: RunEventEmitter
  cancelConfirmation: (subagentId: string) => void
  requestSpec?: AgentRequestSpec
  modelRef?: ModelRef
}

class SubagentRuntimeBridge {
  private readonly channels = new Map<string, ParentRuntimeChannel & { parentActive: boolean; children: number }>()

  register(parentSubmissionId: string, channel: ParentRuntimeChannel): void {
    if (this.channels.has(parentSubmissionId)) throw new Error('Subagent parent channel already registered.')
    this.channels.set(parentSubmissionId, { ...channel, parentActive: true, children: 0 })
  }

  retain(parentSubmissionId?: string): () => void {
    const channel = parentSubmissionId ? this.channels.get(parentSubmissionId) : undefined
    if (!channel) return () => {}
    channel.children += 1
    let released = false
    return () => {
      if (released) return
      released = true
      channel.children -= 1
      if (!channel.parentActive && channel.children === 0) this.channels.delete(parentSubmissionId!)
    }
  }

  releaseParent(parentSubmissionId: string): void {
    const channel = this.channels.get(parentSubmissionId)
    if (!channel) return
    channel.parentActive = false
    if (channel.children === 0) this.channels.delete(parentSubmissionId)
  }

  getRequestSpec(parentSubmissionId: string | undefined, modelRef: ModelRef): AgentRequestSpec | undefined {
    const channel = parentSubmissionId ? this.channels.get(parentSubmissionId) : undefined
    return channel?.modelRef?.accountId === modelRef.accountId && channel.modelRef.modelId === modelRef.modelId
      ? channel.requestSpec
      : undefined
  }

  async request(parentSubmissionId: string, request: ToolConfirmationRequest, signal?: AbortSignal): Promise<ToolConfirmationDecision> {
    signal?.throwIfAborted()
    const channel = this.channels.get(parentSubmissionId)
    if (!channel) return { approved: false, reason: 'parent confirmation channel unavailable' }
    const onAbort = (): void => {
      if (request.agent?.subagentId) channel.cancelConfirmation(request.agent.subagentId)
    }
    try {
      const pending = channel.requester.request(request)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
      return await pending
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  emitSubagentUpdated(parentSubmissionId: string, subagent: SubagentRecord): void {
    this.channels.get(parentSubmissionId)?.emitter.emit(SUBAGENT_EVENTS.SUBAGENT_UPDATED, { subagent })
  }
}

export const subagentRuntimeBridge = new SubagentRuntimeBridge()
