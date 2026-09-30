import { AppConfigStore, ChatModelContextResolver } from '../config'
import { ChatSessionStore } from '../persistence'
import type { RunEventEmitter } from '@main/agent/contracts'
import type { MainAgentRunInput, RunEnvironment } from './types'

export class RunEnvironmentService {
  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly chatModelContextResolver = new ChatModelContextResolver(),
    private readonly chatSessionStore = new ChatSessionStore()
  ) {}

  async prepare(
    input: MainAgentRunInput,
    emitter: RunEventEmitter
  ): Promise<RunEnvironment> {
    const config = this.appConfigStore.requireConfig()
    const modelContext = this.chatModelContextResolver.resolveOrThrow(config, input.modelRef)
    const chat = await this.chatSessionStore.resolveOrCreateChat(input)
    emitter.setChatMeta({ chatId: chat.id, chatUuid: chat.uuid })
    const workspacePath = this.chatSessionStore.resolveWorkspacePath(chat)
    const historyMessages = this.chatSessionStore.loadHistoryMessages(chat)

    return {
      chat,
      modelContext,
      workspacePath,
      historyMessages
    }
  }
}
