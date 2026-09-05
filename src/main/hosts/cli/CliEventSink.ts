import { appendFile } from 'node:fs/promises'
import type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
import type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'
import { redactCliValue } from './CliRedaction'

export interface CliJsonlEnvelope {
  schemaVersion: 1
  runId: string
  type: string
  timestamp: number
  payload: Record<string, unknown>
}

export interface CliEventSinkOptions {
  runId: string
  eventsPath: string
  secrets?: readonly string[]
  writeStdout?: (line: string) => Promise<void>
  appendEvent?: (path: string, line: string) => Promise<void>
}

const writeStdoutLine = (line: string): Promise<void> => new Promise((resolve, reject) => {
  let settled = false
  const stream = process.stdout
  const cleanup = (): void => {
    stream.removeListener('error', onError)
  }
  const finish = (error?: Error): void => {
    if (settled) return
    settled = true
    cleanup()
    if (error) {
      reject(error)
    } else {
      resolve()
    }
  }
  const onError = (error: Error | null): void => finish(error ?? new Error('stdout write failed'))

  stream.once('error', onError)
  try {
    stream.write(line, 'utf8', (error?: Error | null) => finish(error ?? undefined))
  } catch (error) {
    finish(error instanceof Error ? error : new Error(String(error)))
  }
})

const appendEventLine = async (path: string, line: string): Promise<void> => {
  await appendFile(path, line, 'utf8')
}

const toEnvelopePayload = (event: AgentEvent): Record<string, unknown> => {
  const payload = { ...(event as unknown as Record<string, unknown>) }
  delete payload.type
  delete payload.timestamp
  return payload
}

export class CliEventSink implements AgentEventSink {
  private readonly secrets: readonly string[]
  private readonly writeStdout: (line: string) => Promise<void>
  private readonly appendEvent: (path: string, line: string) => Promise<void>
  private finished = false
  private failed?: Error

  constructor(private readonly options: CliEventSinkOptions) {
    this.secrets = options.secrets ?? []
    this.writeStdout = options.writeStdout ?? writeStdoutLine
    this.appendEvent = options.appendEvent ?? appendEventLine
  }

  async handle(event: AgentEvent): Promise<void> {
    await this.emit(event.type, toEnvelopePayload(event), event.timestamp)
  }

  async emit(
    type: string,
    payload: Record<string, unknown>,
    timestamp = Date.now()
  ): Promise<void> {
    if (this.failed) {
      throw this.failed
    }
    if (type === 'run.finished') {
      if (this.finished) {
        throw new Error('CLI run.finished was emitted more than once')
      }
      this.finished = true
    }

    const envelope: CliJsonlEnvelope = {
      schemaVersion: 1,
      runId: this.options.runId,
      type,
      timestamp,
      payload: redactCliValue(payload, this.secrets) as Record<string, unknown>
    }
    const line = `${JSON.stringify(envelope)}\n`

    try {
      await this.appendEvent(this.options.eventsPath, line)
      await this.writeStdout(line)
    } catch (error) {
      this.failed = error instanceof Error
        ? error
        : new Error(String(error))
      throw this.failed
    }
  }
}
