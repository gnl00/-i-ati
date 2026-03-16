import { ChatRunEventEmitterFactory } from '@main/services/chatRun/infrastructure'
import { AppConfigStore } from '@main/services/hostAdapters/chat'
import { CompressionJobService } from './CompressionJobService'
import { TitleJobService } from './TitleJobService'
import type { PostRunJobInput } from './types'

export class PostRunJobService {
  constructor(
    emitterFactory = new ChatRunEventEmitterFactory(),
    private readonly appConfigStore = new AppConfigStore(),
    private readonly titleJobService = new TitleJobService(emitterFactory),
    private readonly compressionJobService = new CompressionJobService(emitterFactory)
  ) {}

  async run(args: PostRunJobInput): Promise<void> {
    const config = this.appConfigStore.getConfig()
    if (!config) {
      return
    }

    await Promise.allSettled([
      this.titleJobService.run(args, config),
      this.compressionJobService.run(args, config)
    ])
  }
}
