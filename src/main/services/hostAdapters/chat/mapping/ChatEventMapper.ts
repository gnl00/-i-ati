import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'

export class ChatEventMapper {
  constructor(private readonly emitter: ChatRunEventEmitter) {}

  emitChatReady(chatEntity: ChatEntity, workspacePath: string): void {
    this.emitter.emit(CHAT_RUN_EVENTS.CHAT_READY, {
      chatEntity,
      workspacePath
    })
  }

  emitMessagesLoaded(messages: MessageEntity[]): void {
    this.emitter.emit(CHAT_RUN_EVENTS.MESSAGES_LOADED, { messages })
  }

  emitChatUpdated(chatEntity: ChatEntity): void {
    this.emitter.emit(CHAT_RUN_EVENTS.CHAT_UPDATED, { chatEntity })
  }

  emitMessageCreated(message: MessageEntity): void {
    this.emitter.emit(CHAT_RUN_EVENTS.MESSAGE_CREATED, { message })
  }

  emitMessageUpdated(message: MessageEntity): void {
    this.emitter.emit(CHAT_RUN_EVENTS.MESSAGE_UPDATED, { message })
  }

  emitToolResultAttached(toolCallId: string, message: MessageEntity): void {
    this.emitter.emit(CHAT_RUN_EVENTS.TOOL_RESULT_ATTACHED, {
      toolCallId,
      message
    })
  }
}
