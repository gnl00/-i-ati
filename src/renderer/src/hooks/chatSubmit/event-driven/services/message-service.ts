import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'

export interface MessageService {
  createUserMessage(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<MessageEntity>

  createAssistantPlaceholder(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<MessageEntity>

  updateLastAssistantMessage(
    context: SubmissionContext,
    updater: (message: MessageEntity) => MessageEntity,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): void

  appendSegment(
    context: SubmissionContext,
    segment: MessageSegment,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): void

  addToolCallMessage(
    context: SubmissionContext,
    toolCalls: IToolCall[],
    content: string,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<void>

  addToolResultMessage(
    context: SubmissionContext,
    toolMsg: ChatMessage,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<void>

  rebuildRequestMessages(context: SubmissionContext): void

  updateAssistantMessagesFromSegments(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<void>

  persistToolMessages(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<void>
}
