import { afterEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth, type Terminal } from '@earendil-works/pi-tui'
import { TuiView, type TuiActions } from '../TuiView'
import { TuiState, displayText } from '../TuiState'

function setup(): {
  state: TuiState
  view: TuiView
  terminal: Terminal
  actions: TuiActions
} {
  const terminal: Terminal = {
    columns: 80,
    rows: 24,
    kittyProtocolActive: false,
    start: vi.fn(),
    stop: vi.fn(),
    drainInput: vi.fn().mockResolvedValue(undefined),
    write: vi.fn(),
    moveBy: vi.fn(),
    hideCursor: vi.fn(),
    showCursor: vi.fn(),
    clearLine: vi.fn(),
    clearFromCursor: vi.fn(),
    clearScreen: vi.fn(),
    setTitle: vi.fn(),
    setProgress: vi.fn()
  }
  const actions: TuiActions = {
    submit: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    newChat: vi.fn(),
    resume: vi.fn(),
    recoverQueue: vi.fn().mockReturnValue(''),
    models: vi.fn().mockReturnValue([]),
    sessions: vi.fn().mockReturnValue([]),
    setModel: vi.fn(),
    setApproval: vi.fn(),
    answer: vi.fn()
  }
  const state = new TuiState()
  return {
    state,
    terminal,
    actions,
    view: new TuiView(state, actions, '/workspace', terminal)
  }
}

afterEach(() => vi.useRealTimers())

describe('TUI view lifecycle', () => {
  it('ignores a held legacy Ctrl+C until input has been quiet for one second', async () => {
    vi.useFakeTimers()
    const { view, actions, terminal } = setup()
    const running = view.start()
    const input = vi.mocked(terminal.start).mock.calls[0][0]
    input('\x03')
    await vi.advanceTimersByTimeAsync(500)
    for (let i = 0; i < 40; i++) {
      input('\x03')
      await vi.advanceTimersByTimeAsync(50)
    }
    expect(actions.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    input('\x03')
    await running
    expect(actions.close).toHaveBeenCalledTimes(1)
  })

  it('ignores Kitty repeats and releases, then accepts a fresh press', async () => {
    vi.useFakeTimers()
    const { view, actions, terminal } = setup()
    Object.defineProperty(terminal, 'kittyProtocolActive', { value: true })
    const running = view.start()
    const input = vi.mocked(terminal.start).mock.calls[0][0]
    input('\x1b[99;5:1u')
    await vi.advanceTimersByTimeAsync(1500)
    input('\x1b[99;5:2u')
    input('\x1b[99;5:3u')
    expect(actions.close).not.toHaveBeenCalled()
    expect(view.ui.render(80).map(displayText).join('\n')).toContain('Press Ctrl+C again')
    input('\x1b[99;5:1u')
    await running
    expect(actions.close).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('confirms Ctrl+C before exiting (active run: %s)', async (active) => {
    vi.useFakeTimers()
    const { view, state, actions, terminal } = setup()
    state.activeRun = active ? 'run' : undefined
    const running = view.start()
    const input = vi.mocked(terminal.start).mock.calls[0][0]
    input('draft')
    input('\x03')
    expect(actions.close).not.toHaveBeenCalled()
    expect(actions.cancel).toHaveBeenCalledTimes(active ? 1 : 0)
    expect(view.ui.render(80).map(displayText).join('\n')).toContain('Press Ctrl+C again')
    expect(view.editor.getText()).toBe('draft')
    state.onChange(true)
    await vi.advanceTimersByTimeAsync(1000)
    input('\x03')
    await vi.advanceTimersByTimeAsync(1000)
    input('\x03')
    await running
    expect(actions.close).toHaveBeenCalledTimes(1)
    expect(terminal.stop).toHaveBeenCalled()
  })

  it('resets exit confirmation on other input and preserves existing notices', async () => {
    vi.useFakeTimers()
    const { view, state, actions, terminal } = setup()
    state.notice = 'Existing notice'
    const running = view.start()
    const input = vi.mocked(terminal.start).mock.calls[0][0]
    input('\x03')
    input('x')
    expect(view.editor.getText()).toBe('x')
    expect(view.ui.render(80).map(displayText).join('\n')).toContain('Existing notice')
    input('\x03')
    expect(actions.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    input('\x03')
    await running
  })

  it('shows exit confirmation after dismissing an open command picker', async () => {
    vi.useFakeTimers()
    const { view, actions, terminal } = setup()
    const running = view.start()
    const input = vi.mocked(terminal.start).mock.calls[0][0]
    input('/help')
    input('\r')
    await vi.advanceTimersByTimeAsync(60)
    input('\x03')
    expect(view.ui.hasOverlay()).toBe(false)
    expect(view.ui.render(80).map(displayText).join('\n')).toContain('Press Ctrl+C again')
    expect(actions.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    input('\x03')
    await running
  })

  it('keeps coalescing deltas after an immediate event interrupts the pending frame', async () => {
    vi.useFakeTimers()
    const { view, state } = setup()
    const render = vi.spyOn(view.ui, 'requestRender')
    state.onChange(false)
    state.onChange(true)
    expect(render).toHaveBeenCalledTimes(1)
    state.onChange(false)
    state.onChange(false)
    await vi.advanceTimersByTimeAsync(50)
    expect(render).toHaveBeenCalledTimes(2)
    await view.exit()
  })

  it('restores the terminal when session shutdown fails', async () => {
    const { view, actions, terminal } = setup()
    vi.mocked(actions.close).mockRejectedValue(new Error('save failed'))
    const stop = vi.spyOn(view.ui, 'stop')
    await expect(view.exit()).rejects.toThrow('save failed')
    expect(terminal.drainInput).toHaveBeenCalled()
    expect(stop).toHaveBeenCalled()
  })

  it('reports an expired approval without crashing or losing the draft', async () => {
    vi.useFakeTimers()
    const { view, state, actions, terminal } = setup()
    view.editor.setText('保留草稿')
    state.interactions = [
      {
        kind: 'approval',
        submissionId: 'run',
        payload: { toolCallId: 'tool', name: 'exec', confirmationId: 'approval', submissionId: 'run', chatUuid: 'chat', status: 'pending', version: 1, createdAt: 1, expiresAt: 300001 }
      }
    ]
    vi.mocked(actions.answer).mockImplementation(() => {
      throw new Error('This request has ended.')
    })
    const running = view.start()
    const onInput = vi.mocked(terminal.start).mock.calls[0][0]
    expect(() => onInput('\r')).not.toThrow()
    expect(state.notice).toBe('This request has ended.')
    expect(view.editor.getText()).toBe('保留草稿')
    await view.exit()
    await running
  })
})

describe('TUI presentation and command picker', () => {
  it('keeps approval and complete action hints visible on narrow terminals', async () => {
    const { view, state } = setup()
    state.model = { accountId: 'local', modelId: '中文模型'.repeat(20) }
    for (const width of [24, 45, 80, 120]) {
      const lines = view.ui.render(width)
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true)
      expect(displayText(lines.at(-2))).toContain('Manual approval')
      expect(displayText(lines.at(-1))).toContain('Enter send')
      expect(displayText(lines.at(-1))).toContain('/help')
      expect(displayText(lines.at(-1))).not.toContain('·')
    }
    state.activeRun = 'run'
    state.onChange(true)
    expect(displayText(view.ui.render(45).at(-1))).toContain('Ctrl+C stop')
    state.queue = [{ id: 'q', text: '保留输入', mode: 'returned' }]
    expect(displayText(view.ui.render(45).at(-1))).toContain('/queue recover input')
    await view.exit()
  })

  it('uses the welcome mark only before the conversation starts and hides default titles', async () => {
    const { view, state } = setup()
    const welcome = view.ui.render(80).map(displayText).join('\n')
    expect(welcome).toContain('╭───╮')
    expect(welcome).toContain('│ i ╯   ati')
    expect(welcome).not.toContain('New Chat')
    state.preview = { id: 1, chatUuid: 'chat', body: { role: 'assistant', content: 'Working', segments: [] } }
    expect(view.ui.render(80).map(displayText).join('\n')).not.toContain('╭───╮')
    await view.exit()
  })

  it('right-aligns approval and help, truncating long models with an ellipsis', async () => {
    const { view, state } = setup()
    state.model = { accountId: 'local', modelId: 'long-model-'.repeat(20) }
    const lines = view.ui.render(80).map(displayText)
    expect(lines.at(-2)).toMatch(/… +Manual approval$/)
    expect(visibleWidth(lines.at(-2)!)).toBe(79)
    expect(lines.at(-1)).toMatch(/Enter send {3}Ctrl\+J newline {3}Tab complete +\/help more$/)
    expect(visibleWidth(lines.at(-1)!)).toBe(79)
    await view.exit()
  })

  it('filters models, selects the matching item, and returns focus to the editor', async () => {
    vi.useFakeTimers()
    const { view, actions, terminal } = setup()
    vi.mocked(actions.models).mockReturnValue([
      {
        value: 'a',
        label: 'Alpha',
        ref: { accountId: 'local', modelId: 'alpha' }
      },
      {
        value: 'b',
        label: 'Beta',
        ref: { accountId: 'local', modelId: 'beta' }
      }
    ])
    const running = view.start()
    const input = vi.mocked(terminal.start).mock.calls[0][0]
    input('/model')
    input('\r')
    await vi.advanceTimersByTimeAsync(60)
    input('Beta')
    input('\x04')
    expect(actions.close).not.toHaveBeenCalled()
    input('\r')
    await vi.advanceTimersByTimeAsync(60)
    expect(actions.setModel).toHaveBeenCalledWith({
      accountId: 'local',
      modelId: 'beta'
    })
    input('新的草稿')
    expect(view.editor.getText()).toBe('新的草稿')
    await view.exit()
    await running
  })

  it('dismisses help without leaving a persistent notice or consuming the next draft', async () => {
    vi.useFakeTimers()
    const { view, state, terminal } = setup()
    const running = view.start()
    const input = vi.mocked(terminal.start).mock.calls[0][0]
    input('/help')
    input('\r')
    await vi.advanceTimersByTimeAsync(60)
    expect(state.notice).toBe('')
    input('\x1b')
    await vi.advanceTimersByTimeAsync(60)
    input('继续')
    expect(view.editor.getText()).toBe('继续')
    await view.exit()
    await running
  })
})
