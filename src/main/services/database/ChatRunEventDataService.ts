import type { ChatRunEventRepository } from '@main/db/repositories/ChatRunEventRepository'

type ChatRunEventDataServiceDeps = {
  hasDb: () => boolean
  getRunEventRepo: () => ChatRunEventRepository | undefined
}

export class ChatRunEventDataService {
  constructor(private readonly deps: ChatRunEventDataServiceDeps) {}

  saveChatRunEvent(data: ChatRunEventTrace): number {
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

  private requireRunEventRepo(): ChatRunEventRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getRunEventRepo()
    if (!repo) throw new Error('Chat run event repository not initialized')
    return repo
  }
}
