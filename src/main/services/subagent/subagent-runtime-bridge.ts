import type {
  ToolConfirmationRequest,
  ToolConfirmationRequester
} from '@main/services/agentCore/ports'
import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import type { SubagentRecord } from '@tools/subagent/index.d'

type ParentRuntimeChannel = {
  requester: ToolConfirmationRequester
  emitter: ChatRunEventEmitter
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

    channel.emitter.emit(CHAT_RUN_EVENTS.SUBAGENT_UPDATED, { subagent })
  }
}

export const subagentRuntimeBridge = new SubagentRuntimeBridge()
