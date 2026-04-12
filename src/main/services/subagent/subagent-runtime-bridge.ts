import type {
  ToolConfirmationRequest,
  ToolConfirmationRequester
} from '@main/agent/contracts'
import type { RunEventEmitter } from '@main/orchestration/chat/run/infrastructure'
import { RUN_OUTPUT_EVENTS } from '@shared/run/output-events'
import type { SubagentRecord } from '@tools/subagent/index.d'

type ParentRuntimeChannel = {
  requester: ToolConfirmationRequester
  emitter: RunEventEmitter
}

class SubagentRuntimeBridge {
  private readonly channels = new Map<string, ParentRuntimeChannel>()

  register(parentSubmissionId: string, channel: ParentRuntimeChannel): void {
    this.channels.set(parentSubmissionId, channel)
  }

  request(parentSubmissionId: string, request: ToolConfirmationRequest) {
    const channel = this.channels.get(parentSubmissionId)
    if (!channel) {
      return Promise.resolve({
        approved: false,
        reason: 'parent confirmation channel unavailable'
      })
    }

    return channel.requester.request(request)
  }

  emitSubagentUpdated(parentSubmissionId: string, subagent: SubagentRecord): void {
    const channel = this.channels.get(parentSubmissionId)
    if (!channel) {
      return
    }

    channel.emitter.emit(RUN_OUTPUT_EVENTS.SUBAGENT_UPDATED, { subagent })
  }
}

export const subagentRuntimeBridge = new SubagentRuntimeBridge()
