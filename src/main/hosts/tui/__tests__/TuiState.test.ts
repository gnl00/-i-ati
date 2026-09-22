import { describe, expect, it } from 'vitest'
import type { RunEventPayloads, RunEventType } from '@shared/run/events'
import { TuiState, displayText } from '../TuiState'
import { TuiTranscript } from '../TuiTranscript'
import { createTuiTheme } from '../TuiTheme'
import { visibleWidth } from '@earendil-works/pi-tui'

const message = (id: number, role = 'assistant', text = 'hello'): MessageEntity => ({
  id,
  chatUuid: 'chat',
  body: {
    role,
    content: text,
    segments: [{ type: 'text', segmentId: `text:${id}`, content: text, timestamp: 1 }]
  }
})
function setup(): {
  state: TuiState
  emit: <T extends RunEventType>(type: T, payload: RunEventPayloads[T]) => void
} {
  const state = new TuiState()
  state.load({ uuid: 'chat', title: 'test', messages: [], createTime: 1, updateTime: 1 }, [])
  state.activeRun = 'run'
  return {
    state,
    emit: (type, payload) =>
      state.handleEvent({
        type,
        payload,
        submissionId: 'run',
        chatUuid: 'chat',
        sequence: 1,
        timestamp: 1
      })
  }
}

describe('TUI event projection', () => {
  it('replaces streamed segment snapshots instead of appending duplicate text', () => {
    const { state, emit } = setup()
    emit('preview.updated', { message: message(1, 'assistant', '你') })
    emit('preview.segment.updated', {
      patch: {
        segment: { type: 'text', segmentId: 'text:1', content: '你好', timestamp: 1 },
        content: '你好'
      }
    })
    expect(state.preview?.body.segments[0]).toMatchObject({ content: '你好' })
    emit('message.created', { message: message(1, 'assistant', '你好') })
    emit('message.updated', { message: message(1, 'assistant', '你好！') })
    emit('preview.cleared', {})
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].body.content).toBe('你好！')
    expect(state.preview).toBeUndefined()
  })
  it('ignores late events from another run or session', () => {
    const { state } = setup()
    for (const identity of [
      { submissionId: 'old', chatUuid: 'chat' },
      { submissionId: 'run', chatUuid: 'other' }
    ]) {
      state.handleEvent({
        ...identity,
        type: 'message.created',
        payload: { message: message(1) },
        sequence: 1,
        timestamp: 1
      })
    }
    expect(state.messages).toEqual([])
  })
  it('keeps steering items until consumed and marks unconsumed input returned', () => {
    const { state, emit } = setup()
    state.queue = [
      { id: 'a', text: 'a', mode: 'steer' },
      { id: 'b', text: 'b', mode: 'steer' }
    ]
    emit('run.steering.consumed', { queueItemId: 'a' })
    emit('run.steering.returned', { queueItemIds: ['b'] })
    expect(state.queue).toEqual([{ id: 'b', text: 'b', mode: 'returned' }])
  })
  it('bounds output and removes an expired approval when a tool finishes', () => {
    const { state, emit } = setup()
    emit('tool.confirmation.required', { toolCallId: 'tool', name: 'command' })
    emit('tool.execution.output', {
      toolCallId: 'tool',
      sequence: 1,
      stdoutBytes: 70000,
      stderrBytes: 0,
      chunks: [{ stream: 'stdout', text: 'x'.repeat(70000) }]
    })
    expect(state.tools.get('tool')?.output.length).toBe(65536)
    emit('tool.execution.failed', {
      toolCallId: 'tool',
      error: { name: 'Denied', message: 'timeout' }
    })
    expect(state.interactions).toEqual([])
    expect(state.tools.get('tool')).toMatchObject({ status: '失败', output: 'timeout' })
  })
  it('trims only the display history at whole user turns', () => {
    const { state, emit } = setup()
    const history = Array.from({ length: 21 }, (_, i) => [
      message(i * 2, 'user'),
      message(i * 2 + 1)
    ]).flat()
    emit('messages.loaded', { messages: history })
    expect(history).toHaveLength(42)
    expect(state.messages).toHaveLength(30)
    expect(state.messages[0].body.role).toBe('user')
    expect(state.trimmed).toBe(true)
  })
  it('does not allow tool output to control the terminal', () => {
    expect(displayText('\x1b[2Jhello\x1b]0;owned\x07\x00\x9b')).toBe('hello')
  })
  it('preserves literal user input and shows failed tool details while collapsed', () => {
    const { state } = setup()
    const assistant = message(2)
    assistant.body.segments = [
      {
        type: 'toolCall',
        segmentId: 'tool',
        toolCallId: 'tool',
        name: 'exec',
        timestamp: 1,
        content: {
          status: 'failed',
          args: JSON.stringify({ command: 'cat missing.txt', risk_score: 10 }),
          error: 'File not found'
        }
      }
    ]
    state.messages = [message(1, 'user', '**literal** _path_'), assistant]
    const transcript = new TuiTranscript(state, createTuiTheme('dark'))
    const text = displayText(transcript.render(60).join('\n'))
    expect(text).toContain('**literal** _path_')
    expect(text).toContain('× exec · 失败')
    expect(text).toContain('cat missing.txt')
    expect(text).toContain('File not found')
    expect(text).not.toContain('risk_score')
  })
  it.each(['dark', 'light'] as const)(
    'renders CJK, code and tools within narrow/wide columns in %s',
    (theme) => {
      const { state } = setup()
      state.messages = [
        message(1, 'user', '看看这段中文与 emoji 👨‍👩‍👦'),
        message(2, 'assistant', '```ts\nconst value = "很长的中文"\n```')
      ]
      const transcript = new TuiTranscript(state, createTuiTheme(theme))
      for (const width of [24, 80, 140]) {
        const lines = transcript.render(width)
        expect(lines.length).toBeGreaterThan(2)
        expect(lines.join('\n')).toContain('中文')
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true)
      }
    }
  )
})
