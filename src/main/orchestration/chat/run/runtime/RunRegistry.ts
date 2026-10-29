import { ChatRunBusyError, DuplicateSubmissionIdError } from './errors'
import { AgentRun } from './AgentRun'

export class RunRegistry {
  private readonly active = new Map<string, AgentRun>()

  add(submissionId: string, run: AgentRun): void {
    this.assertAvailable(submissionId, run.chatUuid)
    this.active.set(submissionId, run)
  }

  assertAvailable(submissionId: string, chatUuid?: string): void {
    if (this.active.has(submissionId)) throw new DuplicateSubmissionIdError(submissionId)
    const owner = chatUuid ? this.getActiveRunForChat(chatUuid) : undefined
    if (owner) throw new ChatRunBusyError(chatUuid!, owner.submissionId)
  }

  get(submissionId: string): AgentRun | undefined {
    return this.active.get(submissionId)
  }

  delete(submissionId: string): void {
    this.active.delete(submissionId)
  }

  hasActiveRunForChat(chatUuid: string): boolean {
    return Boolean(this.getActiveRunForChat(chatUuid))
  }

  getActiveRunForChat(chatUuid: string): AgentRun | undefined {
    for (const run of this.active.values()) {
      if (run.chatUuid === chatUuid) {
        return run
      }
    }
    return undefined
  }
}
