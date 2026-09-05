import { describe, expect, it } from 'vitest'
import { CliEventSink } from '../CliEventSink'

describe('CliEventSink', () => {
  it('writes redacted JSONL envelopes with complete usage and text', async () => {
    const stdout: string[] = []
    const events: string[] = []
    const secret = 'sink-secret-456789'
    const sink = new CliEventSink({
      runId: 'run-1',
      eventsPath: '/tmp/events.jsonl',
      secrets: [secret],
      writeStdout: async (line): Promise<void> => { stdout.push(line) },
      appendEvent: async (_path, line): Promise<void> => { events.push(line) }
    })
    const finalText = 'z'.repeat(12_000)

    await sink.emit('step.delta', {
      finalText: `${finalText}${secret}`,
      apiKey: secret,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
    }, 10)

    expect(stdout).toHaveLength(1)
    expect(events).toEqual(stdout)
    const envelope = JSON.parse(stdout[0])
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      runId: 'run-1',
      type: 'step.delta',
      timestamp: 10,
      payload: {
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        apiKey: '[REDACTED]'
      }
    })
    expect(envelope.payload.finalText).toBe(finalText + '[REDACTED]')
  })

  it('allows exactly one terminal run.finished envelope', async () => {
    const sink = new CliEventSink({
      runId: 'run-2',
      eventsPath: '/tmp/events.jsonl',
      writeStdout: async (): Promise<void> => {},
      appendEvent: async (): Promise<void> => {}
    })

    await sink.emit('run.finished', { status: 'completed' })
    await expect(sink.emit('run.finished', { status: 'completed' })).rejects.toThrow(/more than once/)
  })

  it('makes append failures terminal and avoids stdout after the failed append', async () => {
    const stdout: string[] = []
    const sink = new CliEventSink({
      runId: 'run-3',
      eventsPath: '/tmp/events.jsonl',
      writeStdout: async (line): Promise<void> => { stdout.push(line) },
      appendEvent: async (): Promise<void> => { throw new Error('disk full') }
    })

    await expect(sink.emit('run.started', {})).rejects.toThrow('disk full')
    await expect(sink.emit('run.finished', { status: 'failed' })).rejects.toThrow('disk full')
    expect(stdout).toEqual([])
  })

  it('makes stdout failures terminal after the event file append', async () => {
    const events: string[] = []
    const sink = new CliEventSink({
      runId: 'run-4',
      eventsPath: '/tmp/events.jsonl',
      writeStdout: async (): Promise<void> => { throw new Error('EPIPE') },
      appendEvent: async (_path, line): Promise<void> => { events.push(line) }
    })

    await expect(sink.emit('run.started', {})).rejects.toThrow('EPIPE')
    expect(events).toHaveLength(1)
  })
})
