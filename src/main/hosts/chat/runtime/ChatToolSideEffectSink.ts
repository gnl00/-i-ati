import { chatDb } from '@main/db/chat'
import type { RunEventEmitter } from '@main/agent/contracts'
import type { HostRenderEvent, HostRenderEventSink } from '@main/hosts/shared/render'
import { ChatEventMapper } from '../mapping/ChatEventMapper'

interface ChatToolSideEffectSinkOptions {
  emitter: RunEventEmitter
  chatUuid?: string
  getChatByUuid?: (chatUuid: string) => ChatEntity | undefined
}

const isSuccessfulToolContent = (content: unknown): content is { success: true } => {
  return typeof content === 'object'
    && content !== null
    && !Array.isArray(content)
    && (content as { success?: unknown }).success === true
}

export class ChatToolSideEffectSink implements HostRenderEventSink {
  private readonly chatEvents: ChatEventMapper
  private readonly getChatByUuid: (chatUuid: string) => ChatEntity | undefined

  constructor(private readonly options: ChatToolSideEffectSinkOptions) {
    this.chatEvents = new ChatEventMapper(options.emitter)
    this.getChatByUuid = options.getChatByUuid ?? ((chatUuid) => (
      chatDb.getChatByUuid(chatUuid)
    ))
  }

  handle(event: HostRenderEvent): void {
    if (event.type !== 'host.tool.result.available') {
      return
    }

    const { result } = event
    if (
      result.toolName !== 'chat_set_title'
      || result.status !== 'success'
      || !isSuccessfulToolContent(result.content)
      || !this.options.chatUuid
    ) {
      return
    }

    const chatEntity = this.getChatByUuid(this.options.chatUuid)
    if (!chatEntity) {
      return
    }

    this.chatEvents.emitChatUpdated(chatEntity)
  }
}
