import type { ChatInputState } from '../../types'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'

export type SessionPrepareInput = {
  input: ChatInputState
  model: IModel
  providers: IProvider[]
  chatId?: number
  chatUuid?: string
  controller?: AbortController
}

export interface SessionService {
  prepare(
    input: SessionPrepareInput,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<SubmissionContext>
}
