import { invokeChatSubmit, invokeChatSubmitCancel, subscribeChatSubmitEvents } from '@renderer/invoker/ipcInvoker'
import { AbortError } from '../../errors'
import { SegmentBuilder } from '../streaming/parser'
import { extractContentFromSegments } from '../streaming/segment-utils'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEvent, ChatSubmitEventMeta, ChatSubmitEventPayloads } from '../events'
import type { MessageService } from './message-service'
import type { StreamingService } from './streaming-service'

type MainStreamingOutcome = {
  ok: boolean
  error?: Error
  aborted?: boolean
}

export class MainDrivenStreamingService implements StreamingService {
  private static activeSubscriptions = new Map<string, () => void>()
  private static lastChunkSequence = new Map<string, number>()

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

    const existingUnsub = MainDrivenStreamingService.activeSubscriptions.get(submissionId)
    if (existingUnsub) {
      existingUnsub()
      MainDrivenStreamingService.activeSubscriptions.delete(submissionId)
    }

    const unsubscribe = subscribeChatSubmitEvents((event: ChatSubmitEvent) => {
      if (event.submissionId !== submissionId) {
        return
      }
      if (event.type === 'stream.chunk') {
        const lastSeq = MainDrivenStreamingService.lastChunkSequence.get(submissionId) ?? 0
        if (event.sequence <= lastSeq) {
          return
        }
        MainDrivenStreamingService.lastChunkSequence.set(submissionId, event.sequence)
      }

      switch (event.type) {
        case 'stream.started':
        case 'stream.completed':
        case 'tool.call.detected':
        case 'tool.exec.started':
        case 'tool.exec.completed':
        case 'tool.exec.failed':
        case 'submission.aborted':
        case 'submission.failed': {
          void publisher.emit(event.type as any, event.payload as any, metaWithChat)
          break
        }
        case 'tool.call.flushed': {
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
          break
        }
        case 'tool.result.attached': {
          const payload = event.payload as ChatSubmitEventPayloads['tool.result.attached']
          const toolMessage = payload?.message as MessageEntity | undefined
          if (toolMessage) {
            this.attachToolResultMessage(context, toolMessage)
            void publisher.emit('tool.result.attached', {
              toolCallId: toolMessage.body.toolCallId || '',
              message: toolMessage
            }, metaWithChat)
          }
          break
        }
        case 'tool.call.attached': {
          break
        }
        default: {
          void publisher.emit(event.type as any, event.payload as any, metaWithChat)
        }
      }

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

      if (event.type === 'stream.chunk') {
        this.applyDeltaToAssistant(context, event.payload as ChatSubmitEventPayloads['stream.chunk'], publisher, metaWithChat)
      }

      if (event.type === 'submission.failed') {
        const payload = event.payload as ChatSubmitEventPayloads['submission.failed']
        const error = this.normalizeError(payload?.error)
        pendingOutcome = { ok: false, error }
      }

      if (event.type === 'submission.aborted') {
        pendingOutcome = { ok: false, aborted: true }
      }

      if (event.type === 'stream.completed') {
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
    })
    MainDrivenStreamingService.activeSubscriptions.set(submissionId, unsubscribe)

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
      context.control.signal.removeEventListener('abort', abortListener)
      unsubscribe()
      if (MainDrivenStreamingService.activeSubscriptions.get(submissionId) === unsubscribe) {
        MainDrivenStreamingService.activeSubscriptions.delete(submissionId)
      }
      MainDrivenStreamingService.lastChunkSequence.delete(submissionId)
    }
  }

  private applyDeltaToAssistant(
    context: SubmissionContext,
    payload: { contentDelta?: string; reasoningDelta?: string },
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): void {
    const { contentDelta, reasoningDelta } = payload || {}
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
