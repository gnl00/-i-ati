import type { ChatSubmitEventRepository } from '@main/db/repositories/ChatSubmitEventRepository'

type ChatSubmitEventDataServiceDeps = {
  hasDb: () => boolean
  getSubmitEventRepo: () => ChatSubmitEventRepository | undefined
}

export class ChatSubmitEventDataService {
  constructor(private readonly deps: ChatSubmitEventDataServiceDeps) {}

  saveChatSubmitEvent(data: ChatSubmitEventTrace): number {
    const submitEventRepo = this.requireSubmitEventRepo()
    return submitEventRepo.insert({
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

  private requireSubmitEventRepo(): ChatSubmitEventRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getSubmitEventRepo()
    if (!repo) throw new Error('Chat submit event repository not initialized')
    return repo
  }
}
