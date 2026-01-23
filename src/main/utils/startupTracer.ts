export class StartupTracer {
  private readonly t0 = performance.now()
  private marks = new Map<string, number>()

  mark(label: string): void {
    const t = performance.now() - this.t0
    this.marks.set(label, t)
    console.log(`[Startup] ${label} +${t.toFixed(1)}ms`)
  }

  report(): void {
    const entries = Array.from(this.marks.entries())
    console.log('[Startup] summary', entries)
  }

  reportWithLabel(label: string): void {
    const entries = Array.from(this.marks.entries())
    console.log(`[Startup] summary (${label})`, entries)
  }
}
