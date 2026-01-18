import { v4 as uuidv4 } from 'uuid'
import type { ChatInputState } from '../types'
import type { SubmissionContext } from './context'
import type { EventPublisher } from './event-publisher'
import type { ChatSubmitEventMeta } from './events'
import type {
  FinalizeService,
  MessageService,
  RequestService,
  SessionService,
  StreamingService
} from './services'

export type ChatSubmissionInput = {
  input: ChatInputState
  model: IModel
  providers: IProvider[]
  chatId?: number
  chatUuid?: string
}

type ChatSubmissionDeps = {
  sessionService: SessionService
  messageService: MessageService
  requestService: RequestService
  streamingService: StreamingService
  finalizeService: FinalizeService
}

export class ChatSubmissionService {
  private activeController: AbortController | null = null
  private activeMeta: ChatSubmitEventMeta | null = null
  private activePublisher: EventPublisher | null = null
  private ended = false

  constructor(private readonly deps: ChatSubmissionDeps) {}

  async submit(
    payload: ChatSubmissionInput,
    publisher: EventPublisher
  ): Promise<SubmissionContext> {
    const submissionId = uuidv4()
    const meta: ChatSubmitEventMeta = { submissionId }
    const controller = new AbortController()

    this.activeController = controller
    this.activeMeta = meta
    this.activePublisher = publisher
    this.ended = false

    await publisher.emit('submission.started', { model: payload.model }, meta)

    let context: SubmissionContext | null = null

    try {
      context = await this.deps.sessionService.prepare({
        input: payload.input,
        model: payload.model,
        providers: payload.providers,
        chatId: payload.chatId,
        chatUuid: payload.chatUuid,
        controller
      }, publisher, meta)

      const metaWithChat: ChatSubmitEventMeta = {
        submissionId,
        chatId: context.session.currChatId,
        chatUuid: context.session.chatEntity.uuid
      }

      await this.deps.messageService.createUserMessage(context, publisher, metaWithChat)
      await this.deps.messageService.createAssistantPlaceholder(context, publisher, metaWithChat)
      await this.deps.requestService.build(context, publisher, metaWithChat)
      await this.deps.streamingService.run(context, publisher, metaWithChat)
      await this.deps.finalizeService.finalize(context, publisher, metaWithChat)

      const assistantMessageId = this.getLastAssistantMessageId(context)
      await publisher.emit('submission.completed', { assistantMessageId }, metaWithChat)
      this.ended = true

      return context
    } catch (error: any) {
      if (this.isAbortError(error)) {
        if (!error?.__fromMain) {
          await this.emitAbortOnce('cancelled')
        }
      } else {
        if (error?.__fromMain) {
          throw error
        }
        const metaWithChat: ChatSubmitEventMeta = context?.session?.chatEntity
          ? {
              submissionId,
              chatId: context.session.currChatId,
              chatUuid: context.session.chatEntity.uuid
            }
          : meta
        await publisher.emit('submission.failed', { error }, metaWithChat)
      }
      throw error
    } finally {
      this.clear()
    }
  }

  cancel(reason?: string): void {
    if (this.ended) {
      return
    }
    if (this.activeController && !this.activeController.signal.aborted) {
      this.activeController.abort()
    }
    void this.emitAbortOnce(reason)
  }

  private async emitAbortOnce(reason?: string): Promise<void> {
    if (this.ended) {
      return
    }
    this.ended = true
    if (this.activePublisher && this.activeMeta) {
      await this.activePublisher.emit('submission.aborted', { reason }, this.activeMeta)
    }
  }

  private isAbortError(error: any): boolean {
    return error?.name === 'AbortError'
  }

  private getLastAssistantMessageId(context: SubmissionContext): number {
    const entities = context.session.messageEntities
    for (let i = entities.length - 1; i >= 0; i--) {
      if (entities[i].body.role === 'assistant' && entities[i].id) {
        return entities[i].id!
      }
    }
    return -1
  }

  private clear(): void {
    this.activeController = null
    this.activeMeta = null
    this.activePublisher = null
  }
}
