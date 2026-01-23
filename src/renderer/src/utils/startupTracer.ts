import { STARTUP_RENDERER_MARK } from '@shared/constants/startup'

export class RendererStartupTracer {
  private readonly t0 = performance.now()
  private marks = new Map<string, number>()

  mark(label: string): void {
    const t = performance.now() - this.t0
    this.marks.set(label, t)
    // eslint-disable-next-line no-console
    console.log(`[RendererStartup] ${label} +${t.toFixed(1)}ms`)
    window.electron?.ipcRenderer?.send(STARTUP_RENDERER_MARK, label, t)
  }

  report(): void {
    const entries = Array.from(this.marks.entries())
    // eslint-disable-next-line no-console
    console.log('[RendererStartup] summary', entries)
  }
}

export const rendererStartupTracer = new RendererStartupTracer()
