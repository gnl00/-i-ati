import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'
import type { RequestService } from './request-service'

export class DefaultRequestService implements RequestService {
  async build(
    context: SubmissionContext,
    _publisher: EventPublisher,
    _meta: ChatSubmitEventMeta
  ): Promise<SubmissionContext> {
    return context
  }
}
