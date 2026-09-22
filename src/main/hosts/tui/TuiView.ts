import {
  CombinedAutocompleteProvider,
  Container,
  Editor,
  Input,
  Key,
  matchesKey,
  ProcessTerminal,
  SelectList,
  Text,
  TUI,
  truncateToWidth,
  visibleWidth,
  type Component,
  type OverlayHandle,
  type SelectItem,
  type Terminal
} from '@earendil-works/pi-tui'
import type { ToolUserQuestionAnswer } from '@shared/tools/userQuestion'
import { contentText, displayText, type TuiInteraction, type TuiState } from './TuiState'
import { createTuiTheme, type TuiThemeMode } from './TuiTheme'
import { TuiTranscript } from './TuiTranscript'
import { TuiQuestion } from './TuiQuestion'

export type TuiActions = {
  submit(text: string, mode?: 'steer' | 'followUp'): Promise<void>
  cancel(): void
  close(): Promise<void>
  newChat(): void
  resume(id: string): void
  recoverQueue(): string
  models(): (SelectItem & { ref: ModelRef })[]
  sessions(): ChatEntity[]
  setModel(ref: ModelRef): void
  setApproval(mode: 'manual' | 'auto'): void
  answer(interaction: TuiInteraction, answer: boolean | ToolUserQuestionAnswer[] | null): void
}

export const TUI_COMMANDS = [
  { name: 'help', description: '快捷键与命令' },
  { name: 'new', description: '新建会话' },
  { name: 'sessions', description: '恢复当前工作区会话' },
  { name: 'model', description: '选择模型' },
  { name: 'theme', description: '切换浅色 / 深色' },
  { name: 'tools', description: '展开工具输出 · Ctrl+O' },
  { name: 'thinking', description: '展开思考内容 · Ctrl+T' },
  { name: 'cancel', description: '停止当前执行' },
  { name: 'queue', description: '取回待发送内容到编辑器' },
  { name: 'approval', description: '选择工具审批方式' },
  { name: 'quit', description: '保存并退出' }
]

export class TuiView {
  readonly ui: TUI
  readonly editor: Editor
  private theme = createTuiTheme('dark')
  private mode: TuiThemeMode = 'dark'
  private transcript: TuiTranscript
  private activity = new Text('', 0, 0)
  private queue = new Text('', 0, 0)
  private prompt = new Container()
  private notice = new Text('', 0, 0)
  private dialog?: OverlayHandle
  private activeInteraction?: TuiInteraction
  private timer?: ReturnType<typeof setTimeout>
  private spinner?: ReturnType<typeof setInterval>
  private stopped = false
  private currentChat?: string
  private exitResolve?: () => void

  constructor(
    readonly state: TuiState,
    private readonly actions: TuiActions,
    workspace: string,
    terminal: Terminal = new ProcessTerminal()
  ) {
    this.ui = new TUI(terminal, true)
    this.transcript = new TuiTranscript(state, this.theme)
    this.editor = new Editor(
      this.ui,
      { borderColor: this.theme.muted, selectList: this.theme.select },
      { paddingX: 1 }
    )
    this.editor.setAutocompleteProvider(new CombinedAutocompleteProvider(TUI_COMMANDS, workspace))
    this.editor.onSubmit = (text): void => {
      void this.submit(text)
    }
    this.editor.onChange = (text): void => {
      this.state.draft = text
    }
    this.prompt.addChild(this.editor)
    this.ui.addChild({
      invalidate: (): void => {},
      render: (width): string[] => {
        const path = displayText(workspace).replace(/\s+/g, ' ')
        const title = displayText(this.state.chat?.title || '新会话').replace(/\s+/g, ' ')
        const lines = [
          '',
          this.theme.bold('  ati') +
            this.theme.muted(truncateToWidth(`  /  ${title}`, Math.max(0, width - 5))),
          this.theme.muted(truncateToWidth(`  ${path}`, width)),
          ''
        ]
        if (!this.state.messages.length && !this.state.preview) {
          lines.push(
            ...new Text('描述任务，或输入 / 选择命令。', 2, 0).render(width),
            this.theme.muted(truncateToWidth('  /model 选择模型   /sessions 恢复会话', width)),
            ''
          )
        }
        return lines.map((line) => truncateToWidth(line, width))
      }
    })
    this.ui.addChild(this.transcript)
    this.ui.addChild(this.notice)
    this.ui.addChild(this.activity)
    this.ui.addChild(this.queue)
    this.ui.addChild(this.prompt)
    this.ui.addChild({
      invalidate: (): void => {},
      render: (width): string[] => this.renderFooter(width)
    })
    this.ui.setFocus(this.editor)
    this.ui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl('c'))) {
        this.actions.cancel()
        this.refresh(true)
        return { consume: true }
      }
      if (
        matchesKey(data, Key.ctrl('d')) &&
        !this.editor.getText() &&
        !this.dialog &&
        !this.activeInteraction
      ) {
        void this.exit()
        return { consume: true }
      }
      if (this.dialog || this.activeInteraction) return undefined
      if (matchesKey(data, Key.escape) && this.state.notice) {
        this.state.notice = ''
        this.refresh(true)
        return { consume: true }
      }
      if (matchesKey(data, Key.ctrl('o'))) {
        this.toggleTools()
        return { consume: true }
      }
      if (matchesKey(data, Key.ctrl('t'))) {
        this.toggleThinking()
        return { consume: true }
      }
      if (matchesKey(data, Key.alt('enter'))) {
        void this.submit(this.editor.getExpandedText(), 'followUp')
        return { consume: true }
      }
      return undefined
    })
    state.onChange = (immediate): void => this.refresh(immediate)
  }

  async start(): Promise<void> {
    const exit = new Promise<void>((resolve) => {
      this.exitResolve = resolve
    })
    this.ui.start()
    this.ui.setTerminalColorSchemeNotifications(true)
    this.ui.onTerminalColorSchemeChange((mode) => this.setTheme(mode))
    void this.ui.queryTerminalColorScheme({ timeoutMs: 300 }).then((mode) => {
      if (mode && !this.stopped) this.setTheme(mode)
    })
    this.refresh(true)
    this.spinner = setInterval(() => {
      if (this.state.activeRun) this.refresh()
    }, 120)
    await exit
  }

  async exit(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    try {
      await this.actions.close()
    } finally {
      clearTimeout(this.timer)
      clearInterval(this.spinner)
      this.state.onChange = (): void => {}
      try {
        await this.ui.terminal.drainInput(200, 30)
      } finally {
        this.ui.stop()
        this.exitResolve?.()
      }
    }
  }

  private async submit(text: string, mode: 'steer' | 'followUp' = 'steer'): Promise<void> {
    if (!text.trim()) return
    try {
      this.editor.setText('')
      if (text.startsWith('/')) await this.command(text.trim())
      else {
        await this.actions.submit(text, mode)
        this.editor.addToHistory(text)
      }
    } catch (error) {
      this.state.notice = error instanceof Error ? error.message : String(error)
      this.editor.setText(text)
    }
    this.refresh(true)
  }

  private async command(text: string): Promise<void> {
    switch (text) {
      case '/quit':
        await this.exit()
        break
      case '/cancel':
        this.actions.cancel()
        break
      case '/new':
        this.actions.newChat()
        break
      case '/queue':
        this.editor.setText(this.actions.recoverQueue())
        break
      case '/theme':
        this.setTheme(this.mode === 'dark' ? 'light' : 'dark')
        break
      case '/tools':
        this.toggleTools()
        break
      case '/thinking':
        this.toggleThinking()
        break
      case '/help':
        this.select(
          '命令与快捷键',
          TUI_COMMANDS.filter((command) => command.name !== 'help').map((command) => ({
            value: command.name,
            label: `/${command.name}`,
            description: command.description
          })),
          (item) => {
            void this.submit(`/${item.value}`)
          },
          true
        )
        break
      case '/model':
        this.select('选择模型', this.actions.models(), (item) => {
          const model = this.actions.models().find((m) => m.value === item.value)
          if (model) this.actions.setModel(model.ref)
        })
        break
      case '/sessions':
        this.select(
          '当前工作区会话',
          this.actions.sessions().map((c) => ({
            value: c.uuid,
            label: c.title,
            description: c.uuid
          })),
          (item) => {
            this.actions.resume(item.value)
            for (const m of this.state.messages)
              if (m.body.role === 'user') this.editor.addToHistory(contentText(m.body.content))
          }
        )
        break
      case '/approval':
        this.select(
          '工具审批',
          [
            {
              value: 'manual',
              label: '手动审批',
              description: '需要确认的操作逐项询问'
            },
            {
              value: 'auto',
              label: '自动审批',
              description: '允许工具执行需要确认的操作'
            }
          ],
          (item) => this.actions.setApproval(item.value as 'manual' | 'auto')
        )
        break
      default:
        throw new Error('未知命令。使用 /help 查看可用命令。')
    }
  }

  private select(
    title: string,
    items: SelectItem[],
    choose: (item: SelectItem) => void,
    allowDuringRun = false
  ): void {
    if (!items.length) throw new Error('没有可选项，请先在 ati 设置中配置模型或创建会话。')
    if (this.state.activeRun && !allowDuringRun) throw new Error('请先停止当前执行。')
    const search = new Input()
    let list = new SelectList(
      items.map((item) => ({
        ...item,
        label: displayText(item.label),
        description: displayText(item.description ?? '')
      })),
      Math.max(1, Math.min(8, this.ui.terminal.rows - 10)),
      this.theme.select
    )
    const panel: Component & {
      focused: boolean
      handleInput(data: string): void
    } = {
      get focused(): boolean {
        return search.focused
      },
      set focused(value: boolean) {
        search.focused = value
      },
      invalidate: (): void => {
        search.invalidate()
        list.invalidate()
      },
      render: (width): string[] => [
        this.theme.muted('─'.repeat(width)),
        this.theme.bold(truncateToWidth(` ${title}`, width)),
        this.theme.muted(truncateToWidth(' 输入筛选 · ↑↓ 选择 · Enter 确认 · Esc 返回', width)),
        ...search.render(width),
        ...list.render(width),
        this.theme.muted('─'.repeat(width))
      ],
      handleInput: (data): void => {
        if ([Key.up, Key.down, Key.enter, Key.escape].some((key) => matchesKey(data, key))) {
          list.handleInput(data)
        } else {
          search.handleInput(data)
          const query = search.getValue().toLocaleLowerCase()
          const filtered = items.filter((item) =>
            `${item.label} ${item.description ?? ''} ${item.value}`
              .toLocaleLowerCase()
              .includes(query)
          )
          const next = new SelectList(
            filtered.map((item) => ({
              ...item,
              label: displayText(item.label),
              description: displayText(item.description ?? '')
            })),
            Math.max(1, Math.min(8, this.ui.terminal.rows - 10)),
            this.theme.select
          )
          next.onCancel = list.onCancel
          next.onSelect = list.onSelect
          list = next
        }
        this.ui.requestRender()
      }
    }
    list.onCancel = (): void => {
      this.dialog?.hide()
      this.dialog = undefined
      this.ui.requestRender()
    }
    list.onSelect = (item): void => {
      list.onCancel?.()
      try {
        choose(item)
      } catch (error) {
        this.state.notice = error instanceof Error ? error.message : String(error)
      }
      this.refresh(true)
    }
    this.dialog = this.ui.showOverlay(panel, {
      width: '90%',
      maxHeight: '90%',
      anchor: 'bottom-center',
      margin: 1
    })
  }

  private renderFooter(width: number): string[] {
    const approval = this.state.chat?.permissionApprovalMode === 'auto' ? '自动审批' : '手动审批'
    const model = displayText(this.state.model?.modelId ?? '未选择模型').replace(/\s+/g, ' ')
    const available = Math.max(0, width - visibleWidth(approval) - 5)
    const context = ` ${approval} · ${truncateToWidth(model, available, '')}`
    const hints = this.activeInteraction
      ? ['Enter 确认', 'Esc 取消']
      : this.state.queue.some((item) => item.mode === 'returned')
        ? ['/queue 取回输入', '/help 命令']
        : this.state.activeRun
          ? ['Ctrl+C 停止', 'Enter 插入指令', 'Alt+Enter 排队']
          : ['Enter 发送', 'Ctrl+J 换行', '/help 命令', 'Tab 补全']
    let hint = ''
    for (const part of hints) {
      const next = hint ? `${hint} · ${part}` : ` ${part}`
      if (visibleWidth(next) <= width) hint = next
    }
    return [this.theme.muted(truncateToWidth(context, width, '')), this.theme.muted(hint)]
  }

  private setTheme(mode: TuiThemeMode): void {
    this.mode = mode
    const next = createTuiTheme(mode)
    Object.assign(this.theme.markdown, next.markdown)
    Object.assign(this.theme.select, next.select)
    Object.assign(this.theme, {
      ...next,
      markdown: this.theme.markdown,
      select: this.theme.select
    })
    this.editor.borderColor = this.theme.muted
    this.transcript.setTheme(this.theme)
    this.refresh(true)
  }
  private toggleTools(): void {
    this.state.expandTools = !this.state.expandTools
    this.refresh(true)
  }
  private toggleThinking(): void {
    this.state.showThinking = !this.state.showThinking
    this.transcript.invalidate()
    this.refresh(true)
  }

  private refresh(immediate = false): void {
    if (this.stopped) return
    if (!immediate && this.timer) return
    clearTimeout(this.timer)
    this.timer = undefined
    if (immediate) this.flush()
    else
      this.timer = setTimeout(() => {
        this.timer = undefined
        this.flush()
      }, 50)
  }

  private flush(): void {
    if (this.currentChat !== this.state.chat?.uuid) {
      this.currentChat = this.state.chat?.uuid
      this.editor.setText(this.state.draft)
      for (const message of this.state.messages)
        if (message.body.role === 'user')
          this.editor.addToHistory(contentText(message.body.content))
    }
    const spinning = this.state.activeRun
      ? `${['·', '•', '●', '•'][Math.floor(Date.now() / 120) % 4]} `
      : ''
    const status = this.state.interactions.length ? '等待你的确认' : this.state.status
    this.activity.setText(status === '就绪' ? '' : this.theme.muted(`  ${spinning}${status}`))
    this.editor.borderColor = this.state.interactions.length
      ? this.theme.warning
      : this.state.activeRun
        ? this.theme.muted
        : this.theme.accent
    this.notice.setText(this.state.notice ? this.theme.warning(displayText(this.state.notice)) : '')
    this.queue.setText(
      this.state.queue
        .map((item) => {
          const label =
            item.mode === 'steer' ? '插入' : item.mode === 'followUp' ? '续问' : '已退回'
          return this.theme.warning(
            `${label}  ${displayText(item.text).replace(/\s+/g, ' ').slice(0, 100)}`
          )
        })
        .join('\n')
    )
    this.syncInteraction()
    this.ui.requestRender()
  }

  private syncInteraction(): void {
    const next = this.state.interactions[0]
    if (next === this.activeInteraction) return
    this.prompt.clear()
    this.activeInteraction = next
    if (!next) {
      this.prompt.addChild(this.editor)
      this.ui.setFocus(this.editor)
      return
    }
    const answer = (value: boolean | ToolUserQuestionAnswer[] | null): void => {
      try {
        this.actions.answer(next, value)
      } catch (error) {
        this.state.notice = error instanceof Error ? error.message : String(error)
      }
      this.refresh(true)
    }
    if (next.kind === 'question') {
      const question = new TuiQuestion(next.payload.questions, this.theme, answer, () =>
        this.ui.requestRender()
      )
      this.prompt.addChild(question)
      this.ui.setFocus(question)
    } else {
      const p = next.payload
      this.prompt.addChild(
        new Text(this.theme.warning(`需要批准 · ${displayText(p.ui?.title || p.name)}`), 0, 1)
      )
      this.prompt.addChild(
        new Text(displayText(p.ui?.command || p.args || '').slice(0, 4000), 0, 0)
      )
      if (p.ui?.reason) this.prompt.addChild(new Text(displayText(p.ui.reason), 0, 1))
      const list = new SelectList(
        [
          { value: 'deny', label: '拒绝' },
          { value: 'approve', label: '允许本次操作' }
        ],
        2,
        this.theme.select
      )
      list.onSelect = (item): void => answer(item.value === 'approve')
      list.onCancel = (): void => answer(false)
      this.prompt.addChild(list)
      this.ui.setFocus(list)
    }
  }
}
