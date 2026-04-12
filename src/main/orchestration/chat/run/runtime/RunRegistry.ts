import { DuplicateSubmissionIdError } from './errors'
import { AgentRun } from './AgentRun'

export class RunRegistry {
  private readonly active = new Map<string, AgentRun>()

  add(submissionId: string, run: AgentRun): void {
    if (this.active.has(submissionId)) {
      throw new DuplicateSubmissionIdError(submissionId)
    }
    this.active.set(submissionId, run)
  }

  get(submissionId: string): AgentRun | undefined {
    return this.active.get(submissionId)
  }

  delete(submissionId: string): void {
    this.active.delete(submissionId)
  }

  hasActiveRunForChat(chatUuid: string): boolean {
    for (const run of this.active.values()) {
      if (run.chatUuid === chatUuid) {
        return true
      }
    }
    return false
  }
}
