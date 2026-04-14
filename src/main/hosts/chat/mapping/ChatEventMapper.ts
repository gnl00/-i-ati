import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import {
  CHAT_RENDER_EVENTS,
  type MessageSegmentPatch
} from '@shared/chat/render-events'
import {
  assertMessageEntitySegmentsHaveIds,
  assertMessageSegmentPatchHasIds
} from '@shared/chat/segmentId'
import type { RunEventEmitter } from '@main/orchestration/chat/run/infrastructure'
import type { AgentMessageEventSink } from '@main/agent/contracts'

export class ChatEventMapper implements AgentMessageEventSink {
  constructor(private readonly emitter: RunEventEmitter) {}

  emitChatReady(chatEntity: ChatEntity, workspacePath: string): void {
    this.emitter.emit(CHAT_HOST_EVENTS.CHAT_READY, {
      chatEntity,
      workspacePath
    })
  }

  emitMessagesLoaded(messages: MessageEntity[]): void {
    this.emitter.emit(CHAT_HOST_EVENTS.MESSAGES_LOADED, { messages })
  }

  emitChatUpdated(chatEntity: ChatEntity): void {
    this.emitter.emit(CHAT_HOST_EVENTS.CHAT_UPDATED, { chatEntity })
  }

  emitMessageCreated(message: MessageEntity): void {
    this.emitter.emit(CHAT_RENDER_EVENTS.MESSAGE_CREATED, { message })
  }

  emitMessageUpdated(message: MessageEntity): void {
    assertMessageEntitySegmentsHaveIds(message, 'chat-event-mapper:message-updated')
    this.emitter.emit(CHAT_RENDER_EVENTS.MESSAGE_UPDATED, { message })
  }

  emitMessageSegmentUpdated(messageId: number, patch: MessageSegmentPatch): void {
    assertMessageSegmentPatchHasIds(patch, 'chat-event-mapper:message-segment-updated')
    this.emitter.emit(CHAT_RENDER_EVENTS.MESSAGE_SEGMENT_UPDATED, {
      messageId,
      patch
    })
  }

  emitStreamPreviewUpdated(message: MessageEntity): void {
    assertMessageEntitySegmentsHaveIds(message, 'chat-event-mapper:stream-preview-updated')
    this.emitter.emit(CHAT_RENDER_EVENTS.PREVIEW_UPDATED, { message })
  }

  emitStreamPreviewSegmentUpdated(
    target: { chatId?: number; chatUuid?: string },
    patch: MessageSegmentPatch
  ): void {
    assertMessageSegmentPatchHasIds(patch, 'chat-event-mapper:stream-preview-segment-updated')
    this.emitter.emit(CHAT_RENDER_EVENTS.PREVIEW_SEGMENT_UPDATED, {
      ...target,
      patch
    })
  }

  emitStreamPreviewCleared(): void {
    this.emitter.emit(CHAT_RENDER_EVENTS.PREVIEW_CLEARED, {})
  }

  emitToolResultAttached(toolCallId: string, message: MessageEntity): void {
    assertMessageEntitySegmentsHaveIds(message, 'chat-event-mapper:tool-result-attached')
    this.emitter.emit(CHAT_RENDER_EVENTS.TOOL_RESULT_ATTACHED, {
      toolCallId,
      message
    })
  }
}
