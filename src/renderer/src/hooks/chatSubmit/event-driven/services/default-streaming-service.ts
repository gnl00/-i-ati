import {
  StreamingOrchestrator,
  type StreamingOrchestratorContext,
  type StreamingOrchestratorDeps
} from '../streaming/orchestrator'
import { ChunkParser } from '../streaming/parser'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'
import type { MessageService } from './message-service'
import type { StreamingService } from './streaming-service'
import type { ToolService } from './tool-service'

class EventMessageManagerAdapter {
  constructor(
    private readonly context: SubmissionContext,
    private readonly messageService: MessageService,
    private readonly publisher: EventPublisher,
    private readonly meta: ChatSubmitEventMeta
  ) {}

  rebuildRequestMessages(): void {
    this.messageService.rebuildRequestMessages(this.context)
  }

  updateLastAssistantMessage(updater: (message: MessageEntity) => MessageEntity): void {
    this.messageService.updateLastAssistantMessage(this.context, updater, this.publisher, this.meta)
  }

  getLastAssistantMessage(): MessageEntity {
    const entities = this.context.session.messageEntities
    for (let i = entities.length - 1; i >= 0; i--) {
      if (entities[i].body.role === 'assistant') {
        return entities[i]
      }
    }
    throw new Error('No assistant message found')
  }

  appendSegmentToLastMessage(segment: MessageSegment): void {
    this.messageService.appendSegment(this.context, segment, this.publisher, this.meta)
  }

  addToolCallMessage(toolCalls: IToolCall[], content: string): Promise<void> {
    return this.messageService.addToolCallMessage(this.context, toolCalls, content, this.publisher, this.meta)
  }

  addToolResultMessage(toolMsg: ChatMessage): Promise<void> {
    return this.messageService.addToolResultMessage(this.context, toolMsg, this.publisher, this.meta)
  }

  flushPendingAssistantUpdate(): void {
    // Event-driven flow has no buffered UI update.
  }
}

export class DefaultStreamingService implements StreamingService {
  constructor(
    private readonly messageService: MessageService,
    private readonly toolService: ToolService
  ) {}

  async run(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<SubmissionContext> {
    if (!context.request) {
      throw new Error('Missing request in submission context')
    }

    context.streaming = context.streaming || { tools: [] }

    const metaWithChat = {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    }

    const deps: StreamingOrchestratorDeps = {
      beforeFetch: () => {},
      afterFetch: () => {}
    }

    const parser = new ChunkParser()
    const messageManager = new EventMessageManagerAdapter(context, this.messageService, publisher, metaWithChat)
    const events = {
      onChunk: (result: import('../streaming/parser/types').ParseResult) => {
        if (!result.contentDelta && !result.reasoningDelta) {
          return
        }
        void publisher.emit('stream.chunk', {
          contentDelta: result.contentDelta,
          reasoningDelta: result.reasoningDelta
        }, metaWithChat)
      },
      onToolCallsDetected: (toolCalls: import('../../types').ToolCall[]) => {
        for (const toolCall of toolCalls) {
          void publisher.emit('tool.call.detected', { toolCall }, metaWithChat)
        }
      },
      onToolCallsFlushed: (toolCalls: IToolCall[]) => {
        void publisher.emit('tool.call.flushed', { toolCalls }, metaWithChat)
      }
    }

    const orchestrator = new StreamingOrchestrator({
      context: context as StreamingOrchestratorContext,
      deps,
      parser,
      messageManager,
      signal: context.control.signal,
      callbacks: {
        onPhaseChange: () => {}
      },
      events,
      toolService: {
        execute: (toolCalls) => this.toolService.execute(context, toolCalls, publisher, metaWithChat)
      }
    })

    await publisher.emit('request.sent', { messageCount: context.request.messages.length }, metaWithChat)
    await publisher.emit('stream.started', { stream: context.request.stream !== false }, metaWithChat)

    let ok = false
    try {
      await orchestrator.execute()
      ok = true
      return context
    } finally {
      messageManager.flushPendingAssistantUpdate()
      await publisher.emit('stream.completed', { ok }, metaWithChat)
    }
  }
}
