import { AppConfigStore, ChatModelContextResolver } from '../config'
import { ChatSessionStore } from '../persistence'
import type { RunEventEmitter } from '@main/agent/contracts'
import type { MainAgentRunInput, RunEnvironment, RunPreparationOptions } from './types'

export class RunEnvironmentService {
  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly chatModelContextResolver = new ChatModelContextResolver(),
    private readonly chatSessionStore = new ChatSessionStore()
  ) {}

  async prepare(
    input: MainAgentRunInput,
    emitter: RunEventEmitter,
    options?: RunPreparationOptions
  ): Promise<RunEnvironment> {
    options?.signal?.throwIfAborted()
    const config = this.appConfigStore.requireConfig()
    const modelContext =
      options?.modelContext ??
      this.chatModelContextResolver.resolveOrThrow(config, input.modelRef)
    const chat = await this.chatSessionStore.resolveOrCreateChat(input, options?.signal)
    options?.signal?.throwIfAborted()
    options?.onChatResolved?.(chat)
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
