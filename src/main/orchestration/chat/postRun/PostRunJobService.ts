import { RunEventEmitterFactory } from '@main/orchestration/chat/run/infrastructure'
import { RUN_MAINTENANCE_EVENTS, type PostRunPlan } from '@shared/run/maintenance-events'
import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import { CompressionJobService } from './CompressionJobService'
import { TitleJobService } from './TitleJobService'
import type { PostRunJobInput } from './types'
import { createPostRunEmitter } from './utils'

export class PostRunJobService {
  constructor(
    private readonly emitterFactory = new RunEventEmitterFactory(),
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
    emitter.emit(RUN_MAINTENANCE_EVENTS.POSTRUN_PLAN, plan)
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
