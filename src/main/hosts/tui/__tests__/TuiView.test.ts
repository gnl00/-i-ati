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
        payload: { toolCallId: 'tool', name: 'exec' }
      }
    ]
    vi.mocked(actions.answer).mockImplementation(() => {
      throw new Error('此请求已结束。')
    })
    const running = view.start()
    const onInput = vi.mocked(terminal.start).mock.calls[0][0]
    expect(() => onInput('\r')).not.toThrow()
    expect(state.notice).toBe('此请求已结束。')
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
      expect(displayText(lines.at(-2))).toContain('手动审批')
      expect(displayText(lines.at(-1))).toContain('Enter 发送')
    }
    state.activeRun = 'run'
    state.onChange(true)
    expect(displayText(view.ui.render(45).at(-1))).toContain('Ctrl+C 停止')
    state.queue = [{ id: 'q', text: '保留输入', mode: 'returned' }]
    expect(displayText(view.ui.render(45).at(-1))).toContain('/queue 取回输入')
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
