import { ChatSubmitEventEmitter } from './event-emitter'
import { ChunkParser } from './streaming/parser'
import { StreamingOrchestrator } from './streaming/orchestrator'
import type {
  StreamingOrchestratorContext,
  StreamingOrchestratorDeps
} from './streaming/orchestrator'
import { ToolExecutor } from './streaming/executor'
import type { ToolExecutionProgress } from './streaming/executor/types'
import type { ToolCall } from './types'
import { AbortError } from './errors'
import DatabaseService from '../DatabaseService'

type MainChatSubmitInput = {
  submissionId: string
  request: IUnifiedRequest
  chatId?: number
  chatUuid?: string
}

type ActiveSubmission = {
  controller: AbortController
  emitter: ChatSubmitEventEmitter
}

class MainStreamingMessageManager {
  constructor(
    private readonly messageEntities: MessageEntity[],
    private readonly request: IUnifiedRequest,
    private readonly emitter: ChatSubmitEventEmitter,
    private readonly chatId?: number,
    private readonly chatUuid?: string
  ) {}

  rebuildRequestMessages(): void {
    this.request.messages = this.messageEntities.map(entity => entity.body)
  }

  updateLastAssistantMessage(updater: (message: MessageEntity) => MessageEntity): void {
    const index = this.findLastAssistantIndex()
    if (index < 0) {
      const placeholder: MessageEntity = {
        body: {
          role: 'assistant',
          content: '',
          segments: [],
          typewriterCompleted: false
        }
      }
      this.messageEntities.push(placeholder)
      this.messageEntities[this.messageEntities.length - 1] = updater(placeholder)
    } else {
      this.messageEntities[index] = updater(this.messageEntities[index])
    }
  }

  getLastAssistantMessage(): MessageEntity {
    const index = this.findLastAssistantIndex()
    if (index < 0) {
      throw new Error('No assistant message found')
    }
    return this.messageEntities[index]
  }

  appendSegmentToLastMessage(segment: MessageSegment): void {
    this.updateLastAssistantMessage((message) => {
      const segments = message.body.segments || []
      return {
        ...message,
        body: {
          ...message.body,
          segments: [...segments, segment]
        }
      }
    })
  }

  async addToolCallMessage(toolCalls: IToolCall[], content: string): Promise<void> {
    this.updateLastAssistantMessage((message) => ({
      ...message,
      body: {
        ...message.body,
        content: content || message.body.content || '',
        toolCalls
      }
    }))

    this.emitter.emit('tool.call.attached', {
      toolCallIds: toolCalls.map(call => call.id).filter(Boolean),
      messageId: this.getLastAssistantMessage().id
    })
  }

  async addToolResultMessage(toolMsg: ChatMessage): Promise<void> {
    const entity: MessageEntity = {
      body: toolMsg,
      chatId: this.chatId,
      chatUuid: this.chatUuid
    }

    let saved = false
    try {
      const msgId = DatabaseService.saveMessage(entity)
      entity.id = msgId
      saved = true
    } catch (error) {
      // keep entity without id for UI/debug purposes
    }

    this.messageEntities.push(entity)
    this.emitter.emit('tool.result.attached', {
      toolCallId: toolMsg.toolCallId || '',
      message: entity
    })

    if (saved) {
      this.emitter.emit('tool.result.persisted', {
        toolCallId: toolMsg.toolCallId || '',
        message: entity
      })
    }
  }

  flushPendingAssistantUpdate(): void {
    this.rebuildRequestMessages()
  }

  private findLastAssistantIndex(): number {
    for (let i = this.messageEntities.length - 1; i >= 0; i--) {
      if (this.messageEntities[i].body.role === 'assistant') {
        return i
      }
    }
    return -1
  }
}

export class MainChatSubmitService {
  private active = new Map<string, ActiveSubmission>()

  async submit(input: MainChatSubmitInput): Promise<void> {
    if (this.active.has(input.submissionId)) {
      return
    }

    const controller = new AbortController()
    const emitter = new ChatSubmitEventEmitter({
      submissionId: input.submissionId,
      chatId: input.chatId,
      chatUuid: input.chatUuid
    })

    this.active.set(input.submissionId, { controller, emitter })

    const request = { ...input.request }
    const messageEntities = request.messages.map(body => ({ body }))
    this.ensureAssistantPlaceholder(messageEntities, request)

    const context: StreamingOrchestratorContext = {
      request,
      meta: {
        model: {
          id: request.model,
          label: request.model,
          type: (request.modelType as ModelType) || 'llm'
        }
      },
      streaming: {
        tools: []
      },
      session: {
        chatEntity: input.chatUuid ? { uuid: input.chatUuid } as ChatEntity : undefined
      },
      control: {
        signal: controller.signal
      }
    }

    const deps: StreamingOrchestratorDeps = {
      beforeFetch: () => {},
      afterFetch: () => {}
    }

    const parser = new ChunkParser()
    const messageManager = new MainStreamingMessageManager(
      messageEntities,
      request,
      emitter,
      input.chatId,
      input.chatUuid
    )

    const toolExecutor = new ToolExecutor({
      maxConcurrency: 3,
      signal: controller.signal,
      chatUuid: input.chatUuid,
      onProgress: (progress: ToolExecutionProgress) => {
        if (progress.phase === 'started') {
          emitter.emit('tool.exec.started', {
            toolCallId: progress.id,
            name: progress.name
          })
          return
        }
        if (progress.phase === 'completed') {
          emitter.emit('tool.exec.completed', {
            toolCallId: progress.id,
            result: progress.result?.content,
            cost: progress.result?.cost || 0
          })
          return
        }
        if (progress.phase === 'failed') {
          emitter.emit('tool.exec.failed', {
            toolCallId: progress.id,
            error: progress.result?.error || new Error('Tool execution failed')
          })
        }
      }
    })

    const orchestrator = new StreamingOrchestrator({
      context,
      deps,
      parser,
      messageManager,
      signal: controller.signal,
      callbacks: {
        onPhaseChange: () => {}
      },
      events: {
        onChunk: (result) => {
          if (!result.contentDelta && !result.reasoningDelta) {
            return
          }
          emitter.emit('stream.chunk', {
            contentDelta: result.contentDelta,
            reasoningDelta: result.reasoningDelta
          })
        },
        onToolCallsDetected: (toolCalls: ToolCall[]) => {
          for (const toolCall of toolCalls) {
            emitter.emit('tool.call.detected', { toolCall })
          }
        },
        onToolCallsFlushed: (toolCalls: IToolCall[]) => {
          emitter.emit('tool.call.flushed', { toolCalls })
        }
      },
      toolService: {
        execute: async (toolCalls) => {
          const calls = toolCalls.map(tool => ({
            id: tool.id,
            index: tool.index,
            function: tool.name,
            args: tool.args
          }))
          return toolExecutor.execute(calls)
        }
      }
    })

    emitter.emit('stream.started', { stream: request.stream !== false })

    let ok = false
    try {
      await orchestrator.execute()
      ok = true
    } catch (error: any) {
      if (error instanceof AbortError || error?.name === 'AbortError') {
        emitter.emit('submission.aborted', { reason: 'cancelled' })
      } else {
        emitter.emit('submission.failed', { error: this.serializeError(error) })
      }
      throw error
    } finally {
      messageManager.flushPendingAssistantUpdate()
      emitter.emit('stream.completed', { ok })
      if (ok) {
        emitter.emit('submission.completed', { assistantMessageId: -1 })
      }
      this.active.delete(input.submissionId)
    }
  }

  cancel(submissionId: string, reason?: string): void {
    const active = this.active.get(submissionId)
    if (!active) return
    if (!active.controller.signal.aborted) {
      active.controller.abort()
    }
    this.active.delete(submissionId)
  }

  private serializeError(error: any): { name: string; message: string; stack?: string } {
    return {
      name: error?.name || 'Error',
      message: error?.message || 'Unknown error',
      stack: error?.stack
    }
  }

  private ensureAssistantPlaceholder(messageEntities: MessageEntity[], request: IUnifiedRequest): void {
    const hasAssistant = messageEntities.some(entity => entity.body.role === 'assistant')
    if (hasAssistant) {
      return
    }

    messageEntities.push({
      body: {
        role: 'assistant',
        model: request.model,
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    })
  }
}

export type { MainChatSubmitInput }
