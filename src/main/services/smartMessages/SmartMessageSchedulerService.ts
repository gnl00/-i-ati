import { createLogger } from '@main/logging/LogService'
import {
  smartMessageGenerationService,
  type SmartMessageGenerationService
} from './SmartMessageGenerationService'

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000
const DEFAULT_INITIAL_DELAY_MS = 30 * 1000

export class SmartMessageSchedulerService {
  private timer: NodeJS.Timeout | null = null
  private initialTimer: NodeJS.Timeout | null = null
  private readonly logger = createLogger('SmartMessageSchedulerService')

  constructor(
    private readonly generationService: SmartMessageGenerationService = smartMessageGenerationService
  ) {}

  start(
    intervalMs: number = DEFAULT_INTERVAL_MS,
    initialDelayMs: number = DEFAULT_INITIAL_DELAY_MS
  ): void {
    if (this.timer || this.initialTimer) return

    this.initialTimer = setTimeout(() => {
      this.initialTimer = null
      void this.runOnce()
    }, initialDelayMs)

    this.timer = setInterval(() => {
      void this.runOnce()
    }, intervalMs)

    this.logger.info('scheduler.started', { intervalMs, initialDelayMs })
  }

  stop(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer)
      this.initialTimer = null
    }
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.logger.info('scheduler.stopped')
  }

  async runOnce(): Promise<SmartMessageGenerationResult> {
    const result = await this.generationService.generate()
    this.logger.info('scheduler.tick.completed', result)
    return result
  }
}

export const smartMessageSchedulerService = new SmartMessageSchedulerService()
