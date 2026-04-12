import { createPerfLogger } from '@main/logging/LogService'

const logger = createPerfLogger('Startup')

export class StartupTracer {
  private readonly t0 = performance.now()
  private marks = new Map<string, number>()

  mark(label: string): void {
    const t = performance.now() - this.t0
    this.marks.set(label, t)
    logger.info('mark', { label, offsetMs: Number(t.toFixed(1)) })
  }

  report(): void {
    const entries = Array.from(this.marks.entries())
    logger.info('summary', { entries })
  }

  reportWithLabel(label: string): void {
    const entries = Array.from(this.marks.entries())
    logger.info('summary', { label, entries })
  }
}
