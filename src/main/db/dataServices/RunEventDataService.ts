import type { RunEventRepository } from '@main/db/repositories/RunEventRepository'

type RunEventDataServiceDeps = {
  hasDb: () => boolean
  getRunEventRepo: () => RunEventRepository | undefined
}

export class RunEventDataService {
  constructor(private readonly deps: RunEventDataServiceDeps) {}

  saveRunEvent(data: RunEventTrace): number {
    const runEventRepo = this.requireRunEventRepo()
    return runEventRepo.insert({
      submission_id: data.submissionId,
      chat_id: data.chatId ?? null,
      chat_uuid: data.chatUuid ?? null,
      sequence: data.sequence,
      type: data.type,
      timestamp: data.timestamp,
      payload: data.payload ? JSON.stringify(data.payload) : null,
      meta: data.meta ? JSON.stringify(data.meta) : null
    })
  }

  private requireRunEventRepo(): RunEventRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getRunEventRepo()
    if (!repo) throw new Error('Run event repository not initialized')
    return repo
  }
}

