import { ChatRunEventEmitterFactory } from '@main/services/chatRun/infrastructure'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import { AppConfigStore } from '@main/services/hostAdapters/chat'
import { CompressionJobService } from './CompressionJobService'
import { TitleJobService } from './TitleJobService'
import type { PostRunJobInput } from './types'
import { createPostRunEmitter } from './utils'

export type PostRunPlan = {
  title: 'pending' | 'skipped'
  compression: 'pending' | 'skipped'
}

export class PostRunJobService {
  constructor(
    private readonly emitterFactory = new ChatRunEventEmitterFactory(),
    private readonly appConfigStore = new AppConfigStore(),
    private readonly titleJobService = new TitleJobService(emitterFactory),
    private readonly compressionJobService = new CompressionJobService(emitterFactory)
  ) {}

  getPlan(args: PostRunJobInput): PostRunPlan {
    const config = this.appConfigStore.getConfig()
    if (!config) {
      return {
        title: 'skipped',
        compression: 'skipped'
      }
    }

    const titlePlanned = this.titleJobService.shouldRun(args, config)
    const compressionPlanned = this.compressionJobService.shouldRun(args, config)

    return {
      title: titlePlanned ? 'pending' : 'skipped',
      compression: compressionPlanned ? 'pending' : 'skipped'
    }
  }

  emitPlan(args: PostRunJobInput, plan: PostRunPlan): void {
    const emitter = createPostRunEmitter(this.emitterFactory, args)
    emitter.emit(CHAT_RUN_EVENTS.POST_RUN_PLAN, plan)
  }

  async run(args: PostRunJobInput, plan: PostRunPlan = this.getPlan(args)): Promise<void> {
    const config = this.appConfigStore.getConfig()
    if (!config) {
      return
    }

    await Promise.allSettled([
      plan.title === 'pending' ? this.titleJobService.run(args, config) : Promise.resolve(),
      plan.compression === 'pending' ? this.compressionJobService.run(args, config) : Promise.resolve()
    ])
  }
}
