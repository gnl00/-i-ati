import { invokeChatSubmit, invokeChatSubmitCancel, subscribeChatSubmitEvents } from '@renderer/invoker/ipcInvoker'
import { AbortError } from '../../errors'
import { SegmentBuilder } from '../streaming/parser'
import { extractContentFromSegments } from '../streaming/segment-utils'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEvent, ChatSubmitEventMeta, ChatSubmitEventPayloads } from '../events'
import { isLifecycleEventType, isStreamEventType, isToolEventType } from '../chat-submit-event-router'
import { SubmissionEventService } from '../submission-event-service'
import type { MessageService } from './message-service'
import type { StreamingService } from './streaming-service'

type MainStreamingOutcome = {
  ok: boolean
  error?: Error
  aborted?: boolean
}

type PendingDeltaBuffer = {
  content: string[]
  reasoning: string[]
}

export class MainDrivenStreamingService implements StreamingService {
  private static readonly submissionEventService = new SubmissionEventService()

  constructor(private readonly messageService: MessageService) {}

  async run(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<SubmissionContext> {
    const submissionId = meta.submissionId
    const metaWithChat = {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    }

    let pendingOutcome: MainStreamingOutcome | null = null
    const pendingDeltaBuffer: PendingDeltaBuffer = { content: [], reasoning: [] }
    let pendingFlushTimer: ReturnType<typeof setTimeout> | null = null

    const toolCallNames = new Map<string, string>()
    const toolCallArgs = new Map<string, unknown>()

    const parseToolArgs = (args?: string): unknown => {
      if (!args) return undefined
      try {
        return JSON.parse(args)
      } catch {
        return args
      }
    }

    const flushPendingDelta = (): void => {
      if (pendingFlushTimer) {
        clearTimeout(pendingFlushTimer)
        pendingFlushTimer = null
      }
      if (pendingDeltaBuffer.content.length === 0 && pendingDeltaBuffer.reasoning.length === 0) {
        return
      }
      this.applyBufferedDeltaToAssistant(
        context,
        pendingDeltaBuffer,
        publisher,
        metaWithChat
      )
      pendingDeltaBuffer.content = []
      pendingDeltaBuffer.reasoning = []
    }

    const scheduleDeltaFlush = (): void => {
      if (pendingFlushTimer) {
        return
      }
      pendingFlushTimer = setTimeout(() => {
        pendingFlushTimer = null
        flushPendingDelta()
      }, 16)
    }

    const enqueueDelta = (payload: { contentDelta?: string; reasoningDelta?: string }): void => {
      const { contentDelta, reasoningDelta } = payload || {}
      if (reasoningDelta) {
        pendingDeltaBuffer.reasoning.push(reasoningDelta)
      }
      if (contentDelta) {
        pendingDeltaBuffer.content.push(contentDelta)
      }
      scheduleDeltaFlush()
    }

    const upsertToolCallSegment = (
      toolCallId: string,
      payload: { result?: any; cost?: number; error?: Error; status?: string },
      isError: boolean
    ): void => {
      const name = toolCallNames.get(toolCallId) || 'unknown'
      const args = toolCallArgs.get(toolCallId)
      const content = {
        toolName: name,
        args,
        result: isError ? undefined : payload.result,
        status: payload.status,
        error: isError ? (payload.error?.message || 'Tool execution failed') : undefined,
        raw: isError ? payload.error : payload.result
      }

      this.messageService.updateLastAssistantMessage(
        context,
        (message) => {
          const segments = message.body.segments || []
          let found = false
          const nextSegments = segments.map(segment => {
            if (segment.type === 'toolCall' && segment.toolCallId === toolCallId) {
              found = true
              return {
                ...segment,
                name,
                content,
                cost: payload.cost ?? segment.cost,
                isError,
                timestamp: Date.now()
              }
            }
            return segment
          })

          if (!found) {
            nextSegments.push({
              type: 'toolCall',
              name,
              content,
              cost: payload.cost,
              isError,
              timestamp: Date.now(),
              toolCallId
            })
          }

          return {
            ...message,
            body: {
              ...message.body,
              segments: nextSegments
            }
          }
        },
        publisher,
        metaWithChat
      )
    }

    const handleLifecycleEvent = (event: ChatSubmitEvent): void => {
      void publisher.emit(event.type as any, event.payload as any, metaWithChat)

      if (event.type === 'submission.failed') {
        flushPendingDelta()
        const payload = event.payload as ChatSubmitEventPayloads['submission.failed']
        const error = this.normalizeError(payload?.error)
        pendingOutcome = { ok: false, error }
      }

      if (event.type === 'submission.aborted') {
        flushPendingDelta()
        pendingOutcome = { ok: false, aborted: true }
      }

      if (event.type === 'stream.completed') {
        flushPendingDelta()
        const payload = event.payload as ChatSubmitEventPayloads['stream.completed']
        const totalTokens = payload?.usage?.totalTokens
        if (typeof totalTokens === 'number') {
          this.messageService.updateLastAssistantMessage(context, (message) => ({
            ...message,
            tokens: totalTokens
          }), publisher, metaWithChat)
        }
        pendingOutcome = pendingOutcome || { ok: true }
      }
    }

    const handleStreamEvent = (event: ChatSubmitEvent): void => {
      if (event.type !== 'stream.chunk') {
        return
      }
      enqueueDelta(event.payload as ChatSubmitEventPayloads['stream.chunk'])
    }

    const handleToolEvent = (event: ChatSubmitEvent): void => {
      if (event.type === 'tool.call.attached') {
        return
      }

      if (event.type === 'tool.call.flushed') {
        const payload = event.payload as ChatSubmitEventPayloads['tool.call.flushed']
        void publisher.emit('tool.call.flushed', payload, metaWithChat)
        const toolCalls = payload?.toolCalls || []
        toolCalls.forEach((call: IToolCall) => {
          if (call.id) {
            toolCallNames.set(call.id, call.function?.name || 'unknown')
            toolCallArgs.set(call.id, parseToolArgs(call.function?.arguments))
          }
        })
        const content = extractContentFromSegments(
          this.getLastAssistantMessage(context).body.segments
        )
        void this.messageService.addToolCallMessage(context, toolCalls, content, publisher, metaWithChat)
        return
      }

      if (event.type === 'tool.result.attached') {
        const payload = event.payload as ChatSubmitEventPayloads['tool.result.attached']
        const toolMessage = payload?.message as MessageEntity | undefined
        if (toolMessage) {
          this.attachToolResultMessage(context, toolMessage)
          void publisher.emit('tool.result.attached', {
            toolCallId: toolMessage.body.toolCallId || '',
            message: toolMessage
          }, metaWithChat)
        }
        return
      }

      void publisher.emit(event.type as any, event.payload as any, metaWithChat)

      if (event.type === 'tool.exec.started') {
        const toolCallId = (event.payload as ChatSubmitEventPayloads['tool.exec.started'])?.toolCallId
        if (toolCallId) {
          const name = (event.payload as ChatSubmitEventPayloads['tool.exec.started'])?.name
          if (name) {
            toolCallNames.set(toolCallId, name)
          }
          upsertToolCallSegment(toolCallId, { status: 'running' }, false)
        }
      }

      if (event.type === 'tool.exec.completed') {
        const payload = event.payload as ChatSubmitEventPayloads['tool.exec.completed']
        const toolCallId = payload?.toolCallId
        if (toolCallId) {
          upsertToolCallSegment(toolCallId, {
            result: payload?.result,
            cost: payload?.cost,
            status: 'completed'
          }, false)
        }
      }

      if (event.type === 'tool.exec.failed') {
        const payload = event.payload as ChatSubmitEventPayloads['tool.exec.failed']
        const toolCallId = payload?.toolCallId
        if (toolCallId) {
          upsertToolCallSegment(toolCallId, {
            error: payload?.error,
            cost: (payload as any)?.cost,
            status: 'failed'
          }, true)
        }
      }
    }

    const unsubscribe = subscribeChatSubmitEvents((event: ChatSubmitEvent) => {
      if (event.submissionId !== submissionId) {
        return
      }
      if (!MainDrivenStreamingService.submissionEventService.shouldProcessEvent(event)) {
        return
      }

      if (isToolEventType(event.type)) {
        handleToolEvent(event)
        return
      }

      if (isStreamEventType(event.type)) {
        handleStreamEvent(event)
        return
      }

      if (isLifecycleEventType(event.type)) {
        handleLifecycleEvent(event)
        return
      }

      void publisher.emit(event.type as any, event.payload as any, metaWithChat)
    })
    MainDrivenStreamingService.submissionEventService.replaceActiveSubscription(submissionId, unsubscribe)

    const abortListener = () => {
      void invokeChatSubmitCancel({ submissionId, reason: 'abort' })
    }

    context.control.signal.addEventListener('abort', abortListener)

    try {
      await invokeChatSubmit({
        submissionId,
        input: context.input,
        modelRef: {
          accountId: context.meta.account.id,
          modelId: context.meta.model.id
        },
        chatId: context.session.currChatId,
        chatUuid: context.session.chatEntity.uuid
      })

      await this.waitForCompletion(() => pendingOutcome)

      const outcome = pendingOutcome as MainStreamingOutcome | null

      if (outcome?.aborted) {
        const abortError = new AbortError('Request aborted')
        ;(abortError as any).__fromMain = true
        throw abortError
      }

      if (outcome?.error) {
        ;(outcome.error as any).__fromMain = true
        throw outcome.error
      }

      return context
    } finally {
      flushPendingDelta()
      context.control.signal.removeEventListener('abort', abortListener)
      unsubscribe()
      MainDrivenStreamingService.submissionEventService.clearActiveSubscription(submissionId, unsubscribe)
      MainDrivenStreamingService.submissionEventService.clearSubmission(submissionId)
    }
  }

  private applyBufferedDeltaToAssistant(
    context: SubmissionContext,
    pendingBuffer: PendingDeltaBuffer,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): void {
    const reasoningDelta = pendingBuffer.reasoning.join('')
    const contentDelta = pendingBuffer.content.join('')
    if (!contentDelta && !reasoningDelta) {
      return
    }

    const segmentBuilder = new SegmentBuilder()
    this.messageService.updateLastAssistantMessage(context, (message) => {
      const segments = message.body.segments || []
      let nextSegments = [...segments]

      if (reasoningDelta && reasoningDelta.trim()) {
        nextSegments = segmentBuilder.appendSegment(nextSegments, reasoningDelta, 'reasoning')
      }

      if (contentDelta && contentDelta.trim()) {
        nextSegments = segmentBuilder.appendSegment(nextSegments, contentDelta, 'text')
      }

      return {
        ...message,
        body: {
          ...message.body,
          segments: nextSegments
        }
      }
    }, publisher, meta)
  }

  private getLastAssistantMessage(context: SubmissionContext): MessageEntity {
    const entities = context.session.messageEntities
    for (let i = entities.length - 1; i >= 0; i--) {
      if (entities[i].body.role === 'assistant') {
        return entities[i]
      }
    }
    throw new Error('No assistant message found')
  }

  private attachToolResultMessage(context: SubmissionContext, message: MessageEntity): void {
    const entities = context.session.messageEntities
    if (message.id && entities.some(existing => existing.id === message.id)) {
      return
    }

    entities.push(message)
    context.session.chatMessages = entities.map(entity => entity.body)

    if (message.id) {
      const chatMessages = context.session.chatEntity.messages || []
      if (!chatMessages.includes(message.id)) {
        context.session.chatEntity.messages = [...chatMessages, message.id]
      }
    }
  }

  private normalizeError(error: any): Error {
    if (!error) {
      return new Error('Unknown error')
    }
    const normalized = new Error(error.message || 'Unknown error')
    normalized.name = error.name || 'Error'
    if (error.stack) {
      normalized.stack = error.stack
    }
    return normalized
  }

  private waitForCompletion(getOutcome: () => MainStreamingOutcome | null): Promise<void> {
    return new Promise((resolve) => {
      const tick = () => {
        if (getOutcome()) {
          resolve()
          return
        }
        setTimeout(tick, 10)
      }
      tick()
    })
  }
}
