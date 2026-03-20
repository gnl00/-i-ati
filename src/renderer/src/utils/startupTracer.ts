import { STARTUP_RENDERER_MARK } from '@shared/constants/startup'

export class RendererStartupTracer {
  private readonly t0 = performance.now()
  private marks = new Map<string, number>()

  mark(label: string): void {
    const t = performance.now() - this.t0
    this.marks.set(label, t)
    // 启动性能标记统一交给 main 侧写入 perf.log，避免混入普通 app 日志。
    window.electron?.ipcRenderer?.send(STARTUP_RENDERER_MARK, label, t)
  }

  report(): void {
    const entries = Array.from(this.marks.entries())
    for (const [label, offsetMs] of entries) {
      window.electron?.ipcRenderer?.send(STARTUP_RENDERER_MARK, `summary.${label}`, offsetMs)
    }
  }
}

export const rendererStartupTracer = new RendererStartupTracer()
