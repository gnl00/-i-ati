import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import {
  assertMessageEntitySegmentsHaveIds,
  assertMessageSegmentPatchHasIds
} from '@shared/chatRun/segmentId'
import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'
import type { AgentMessageEventSink } from '@main/services/agent/contracts'
import type { ChatRunMessageSegmentPatch } from '@shared/chatRun/events'

export class ChatEventMapper implements AgentMessageEventSink {
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
    assertMessageEntitySegmentsHaveIds(message, 'chat-event-mapper:message-updated')
    this.emitter.emit(CHAT_RUN_EVENTS.MESSAGE_UPDATED, { message })
  }

  emitMessageSegmentUpdated(messageId: number, patch: ChatRunMessageSegmentPatch): void {
    assertMessageSegmentPatchHasIds(patch, 'chat-event-mapper:message-segment-updated')
    this.emitter.emit(CHAT_RUN_EVENTS.MESSAGE_SEGMENT_UPDATED, {
      messageId,
      patch
    })
  }

  emitStreamPreviewUpdated(message: MessageEntity): void {
    assertMessageEntitySegmentsHaveIds(message, 'chat-event-mapper:stream-preview-updated')
    this.emitter.emit(CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED, { message })
  }

  emitStreamPreviewSegmentUpdated(
    target: { chatId?: number; chatUuid?: string },
    patch: ChatRunMessageSegmentPatch
  ): void {
    assertMessageSegmentPatchHasIds(patch, 'chat-event-mapper:stream-preview-segment-updated')
    this.emitter.emit(CHAT_RUN_EVENTS.STREAM_PREVIEW_SEGMENT_UPDATED, {
      ...target,
      patch
    })
  }

  emitStreamPreviewCleared(): void {
    this.emitter.emit(CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED, {})
  }

  emitToolResultAttached(toolCallId: string, message: MessageEntity): void {
    assertMessageEntitySegmentsHaveIds(message, 'chat-event-mapper:tool-result-attached')
    this.emitter.emit(CHAT_RUN_EVENTS.TOOL_RESULT_ATTACHED, {
      toolCallId,
      message
    })
  }
}
