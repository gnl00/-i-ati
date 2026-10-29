import { CompressionSummaryResolver } from './request/CompressionSummaryResolver'
import { AppConfigStore, ChatModelContextResolver } from '../config'
import { ChatSessionStore } from '../persistence'
import type { RunEventEmitter } from '@main/agent/contracts'
import type { MainAgentRunInput, RunEnvironment, RunPreparationOptions } from './types'

export class RunEnvironmentService {
  constructor(
    private readonly appConfigStore = new AppConfigStore(),
    private readonly chatModelContextResolver = new ChatModelContextResolver(),
    private readonly chatSessionStore = new ChatSessionStore(),
    private readonly compressionSummaryResolver = new CompressionSummaryResolver()
  ) {}

  async prepare(
    input: MainAgentRunInput,
    emitter: RunEventEmitter,
    options?: RunPreparationOptions
  ): Promise<RunEnvironment> {
    options?.signal?.throwIfAborted()
    const config = structuredClone(this.appConfigStore.requireConfig())
    const modelContext =
      options?.modelContext ??
      this.chatModelContextResolver.resolveOrThrow(config, input.modelRef)
    const chat = await this.chatSessionStore.resolveOrCreateChat(input, options?.signal)
    options?.signal?.throwIfAborted()
    options?.onChatResolved?.(chat)
    emitter.setChatMeta({ chatId: chat.id, chatUuid: chat.uuid })
    const workspacePath = this.chatSessionStore.resolveWorkspacePath(chat)
    const { messages: historyMessages, summary: compressionSummary } = this.chatSessionStore.loadModelHistory(
      chat, this.compressionSummaryResolver.resolve(config, chat.id)
    )

    return {
      config,
      chat,
      modelContext,
      workspacePath,
      historyMessages,
      compressionSummary
    }
  }
}
