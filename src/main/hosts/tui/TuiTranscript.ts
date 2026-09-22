import { Container, Markdown, Text, truncateToWidth, type Component } from '@earendil-works/pi-tui'
import { HIDDEN_MESSAGE_SOURCES } from '@shared/messages/messageSources'
import { contentText, displayText, type TuiState } from './TuiState'
import type { TuiTheme } from './TuiTheme'

class ToolView implements Component {
  constructor(
    private readonly segment: ToolCallSegment,
    private readonly state: TuiState,
    private readonly theme: TuiTheme,
    private readonly runId: string | undefined
  ) {}
  invalidate(): void {
    /* Tool output is read live from state. */
  }
  render(width: number): string[] {
    const tool =
      this.runId && this.runId === this.state.activeRun && this.segment.toolCallId
        ? this.state.tools.get(this.segment.toolCallId)
        : undefined
    const stored =
      this.segment.content && typeof this.segment.content === 'object'
        ? (this.segment.content as {
            status?: string
            args?: unknown
            result?: unknown
            error?: string
          })
        : undefined
    const status =
      tool?.status ??
      (this.segment.isError
        ? '失败'
        : ({
            pending: '准备',
            running: '运行',
            success: '完成',
            failed: '失败',
            aborted: '已停止'
          }[stored?.status ?? ''] ?? '完成'))
    const name = tool?.name ?? this.segment.name
    const color =
      status === '失败'
        ? this.theme.error
        : status === '运行'
          ? this.theme.accent
          : this.theme.muted
    let rawArgs = tool?.args ?? stored?.args
    if (typeof rawArgs === 'string') {
      try {
        rawArgs = JSON.parse(rawArgs)
      } catch {
        // Streaming arguments can be incomplete; keep the available text visible.
      }
    }
    const details =
      rawArgs && typeof rawArgs === 'object' ? (rawArgs as Record<string, unknown>) : undefined
    const args = displayText(
      details?.command ?? details?.file_path ?? details?.path ?? details?.query ?? rawArgs ?? ''
    )
      .replace(/\s+/g, ' ')
      .slice(0, 200)
    const symbol = status === '失败' ? '×' : status === '完成' ? '✓' : '›'
    const lines = [color(truncateToWidth(`  ${symbol} ${displayText(name)} · ${status}`, width))]
    if (args) lines.push(this.theme.muted(truncateToWidth(`    ${args}`, width)))
    if (this.state.expandTools || status === '失败') {
      const text = displayText(tool?.output || stored?.error || stored?.result || '')
      const output = new Text(text.slice(-65536), 4, 0).render(width)
      if (output.length > 40)
        lines.push(this.theme.muted(truncateToWidth('  … 较早输出已折叠', width)))
      lines.push(...output.slice(-40).map((line) => this.theme.muted(line)))
    }
    return lines
  }
}

/** Keep component instances for unchanged messages so Markdown's width/text cache remains useful. */
export class TuiTranscript implements Component {
  private cache = new Map<MessageEntity, Container>()
  constructor(
    private readonly state: TuiState,
    private theme: TuiTheme
  ) {}
  setTheme(theme: TuiTheme): void {
    this.theme = theme
    this.invalidate()
  }
  invalidate(): void {
    this.cache.clear()
  }

  render(width: number): string[] {
    const messages = [
      ...this.state.messages,
      ...(this.state.preview ? [this.state.preview] : [])
    ].filter(
      (message) =>
        ['user', 'assistant'].includes(message.body.role) &&
        (!message.body.source ||
          !HIDDEN_MESSAGE_SOURCES.has(message.body.source) ||
          message === this.state.preview)
    )
    const current = new Set(messages)
    for (const key of this.cache.keys()) if (!current.has(key)) this.cache.delete(key)
    const lines: string[] = this.state.trimmed
      ? [this.theme.muted(truncateToWidth('较早对话已收起，完整记录保存在会话中。', width)), '']
      : []
    for (const message of messages) {
      let component = this.cache.get(message)
      if (!component) {
        component = this.build(message)
        this.cache.set(message, component)
      }
      const rendered = component.render(width)
      if (rendered.length) lines.push(...rendered, '')
    }
    return lines
  }

  private build(message: MessageEntity): Container {
    const container = new Container()
    const body = message.body
    const text = contentText(body.content)
    const segments = body.segments.filter((s) => s.presentation?.transcriptVisible !== false)
    if (!text.trim() && segments.length === 0) return container
    container.addChild(
      new Text(
        body.role === 'user'
          ? this.theme.accent(this.theme.bold('› 你'))
          : this.theme.bold('● ati'),
        0,
        0
      )
    )
    if (body.role === 'user' || segments.length === 0) {
      container.addChild(
        body.role === 'user'
          ? new Text(displayText(text), 2, 0)
          : new Markdown(displayText(text), 2, 0, this.theme.markdown)
      )
      return container
    }
    for (const segment of segments) {
      if (segment.type === 'text')
        container.addChild(new Markdown(displayText(segment.content), 2, 0, this.theme.markdown))
      if (segment.type === 'reasoning') {
        container.addChild(
          this.state.showThinking
            ? new Markdown(displayText(segment.content), 2, 0, this.theme.markdown, {
                color: this.theme.muted
              })
            : new Text(this.theme.muted('思考 · Ctrl+T 展开'), 2, 0)
        )
      }
      if (segment.type === 'toolCall')
        container.addChild(
          new ToolView(
            segment,
            this.state,
            this.theme,
            message === this.state.preview
              ? this.state.activeRun
              : this.state.messageRuns.get(message)
          )
        )
      if (segment.type === 'error')
        container.addChild(new Text(this.theme.error(displayText(segment.error.message)), 0, 0))
    }
    return container
  }
}
