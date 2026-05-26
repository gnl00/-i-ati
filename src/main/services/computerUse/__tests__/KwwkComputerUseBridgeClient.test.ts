import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  KwwkBridgeError,
  KwwkComputerUseBridgeClient,
  type KwwkBridgeTransport
} from '../KwwkComputerUseBridgeClient'

class FakeTransport implements KwwkBridgeTransport {
  readonly sent: string[] = []
  readonly events = new EventEmitter()
  startCalls = 0
  stopCalls = 0

  async start(): Promise<void> {
    this.startCalls += 1
  }

  send(line: string): void {
    this.sent.push(line)
  }

  async stop(): Promise<void> {
    this.stopCalls += 1
  }

  onLine(listener: (line: string) => void): () => void {
    this.events.on('line', listener)
    return () => this.events.off('line', listener)
  }

  onExit(listener: (error?: Error) => void): () => void {
    this.events.on('exit', listener)
    return () => this.events.off('exit', listener)
  }

  respond(response: unknown): void {
    this.events.emit('line', JSON.stringify(response))
  }

  emitRawLine(line: string): void {
    this.events.emit('line', line)
  }

  exit(error?: Error): void {
    this.events.emit('exit', error)
  }
}

const flushBridgeRequest = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('KwwkComputerUseBridgeClient', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends state requests over newline-delimited JSON-RPC', async () => {
    const transport = new FakeTransport()
    const client = new KwwkComputerUseBridgeClient({
      transport,
      idFactory: () => 'request-1'
    })

    const promise = client.state({
      app: 'Google Chrome',
      includeScreenshot: true
    })
    await flushBridgeRequest()

    expect(transport.startCalls).toBe(1)
    expect(transport.sent).toHaveLength(1)
    expect(JSON.parse(transport.sent[0])).toEqual({
      jsonrpc: '2.0',
      id: 'request-1',
      method: 'state',
      params: {
        app: 'Google Chrome',
        includeScreenshot: true
      }
    })

    transport.respond({
      jsonrpc: '2.0',
      id: 'request-1',
      result: {
        metadata: { id: 'snapshot-1' },
        nodes: [{ index: 1, role: 'AXButton', title: 'Reload' }]
      }
    })

    await expect(promise).resolves.toEqual({
      metadata: { id: 'snapshot-1' },
      nodes: [{ index: 1, role: 'AXButton', title: 'Reload' }]
    })
  })

  it('requests runtime diagnostics and permission prompts', async () => {
    const transport = new FakeTransport()
    const ids = ['diagnostics-1', 'permissions-1']
    const client = new KwwkComputerUseBridgeClient({
      transport,
      idFactory: () => ids.shift() || 'fallback'
    })

    const diagnosticsPromise = client.diagnostics()
    await flushBridgeRequest()
    expect(JSON.parse(transport.sent[0])).toMatchObject({
      id: 'diagnostics-1',
      method: 'diagnostics',
      params: {}
    })
    transport.respond({
      id: 'diagnostics-1',
      result: {
        helperPath: '/tmp/kwwk-computer-use-bridge',
        permissions: {
          accessibilityTrusted: false,
          screenCaptureTrusted: true
        },
        codeSigning: {
          signed: true
        }
      }
    })

    await expect(diagnosticsPromise).resolves.toMatchObject({
      helperPath: '/tmp/kwwk-computer-use-bridge',
      permissions: {
        accessibilityTrusted: false,
        screenCaptureTrusted: true
      },
      transport: {
        resolvedFrom: expect.any(String)
      }
    })

    const permissionsPromise = client.requestPermissions()
    await flushBridgeRequest()
    expect(JSON.parse(transport.sent[1])).toMatchObject({
      id: 'permissions-1',
      method: 'requestPermissions',
      params: {}
    })
    transport.respond({
      id: 'permissions-1',
      result: {
        accessibilityTrusted: true,
        screenCaptureTrusted: true
      }
    })

    await expect(permissionsPromise).resolves.toEqual({
      accessibilityTrusted: true,
      screenCaptureTrusted: true
    })
  })

  it('maps element clicks to the bridge click method', async () => {
    const transport = new FakeTransport()
    const client = new KwwkComputerUseBridgeClient({
      transport,
      idFactory: () => 'request-1'
    })

    const promise = client.clickElement({
      snapshotId: 'snapshot-1',
      elementIndex: 171,
      includeScreenshotAfter: true
    })
    await flushBridgeRequest()

    expect(JSON.parse(transport.sent[0])).toMatchObject({
      method: 'click',
      params: {
        snapshotId: 'snapshot-1',
        elementIndex: 171,
        includeScreenshotAfter: true
      }
    })

    transport.respond({
      id: 'request-1',
      result: {
        text: 'clicked'
      }
    })

    await expect(promise).resolves.toEqual({ text: 'clicked' })
  })

  it('rejects bridge errors with code and data', async () => {
    const transport = new FakeTransport()
    const client = new KwwkComputerUseBridgeClient({
      transport,
      idFactory: () => 'request-1'
    })

    const promise = client.openApp({ app: 'Missing App' })
    await flushBridgeRequest()
    transport.respond({
      id: 'request-1',
      error: {
        code: 'APP_NOT_FOUND',
        message: 'App was not found',
        data: { app: 'Missing App' }
      }
    })

    await expect(promise).rejects.toMatchObject({
      name: 'KwwkBridgeError',
      code: 'APP_NOT_FOUND',
      data: { app: 'Missing App' }
    })
  })

  it('times out pending requests', async () => {
    vi.useFakeTimers()
    const transport = new FakeTransport()
    const client = new KwwkComputerUseBridgeClient({
      transport,
      idFactory: () => 'request-1',
      requestTimeoutMs: 100
    })

    const promise = client.runningApps()
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'KwwkBridgeError',
      code: 'BRIDGE_REQUEST_TIMEOUT'
    })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })

  it('rejects pending requests when the helper exits', async () => {
    const transport = new FakeTransport()
    const client = new KwwkComputerUseBridgeClient({
      transport,
      idFactory: () => 'request-1'
    })

    const promise = client.listApps()
    await flushBridgeRequest()
    transport.exit(new Error('helper crashed'))

    await expect(promise).rejects.toThrow('helper crashed')
  })

  it('ignores malformed and unknown response lines', async () => {
    const transport = new FakeTransport()
    const client = new KwwkComputerUseBridgeClient({
      transport,
      idFactory: () => 'request-1'
    })

    const promise = client.listWindows({ app: 'Finder' })
    await flushBridgeRequest()
    transport.emitRawLine('{')
    transport.respond({ id: 'other', result: [] })
    transport.respond({ id: 'request-1', result: [{ windowId: 1, title: 'Finder' }] })

    await expect(promise).resolves.toEqual([{ windowId: 1, title: 'Finder' }])
  })

  it('stops the helper after finish', async () => {
    const transport = new FakeTransport()
    const client = new KwwkComputerUseBridgeClient({
      transport,
      idFactory: () => 'request-1'
    })

    const promise = client.finish()
    await expect(promise).resolves.toBeUndefined()
    expect(transport.stopCalls).toBe(1)
  })

  it('requests native finish before stopping a started helper', async () => {
    const transport = new FakeTransport()
    const client = new KwwkComputerUseBridgeClient({
      transport,
      idFactory: () => 'request-1'
    })

    const appsPromise = client.listApps()
    await flushBridgeRequest()
    transport.respond({ id: 'request-1', result: [] })
    await appsPromise

    const finishPromise = client.finish()
    await flushBridgeRequest()
    expect(JSON.parse(transport.sent[1])).toMatchObject({
      id: 'request-1',
      method: 'finish',
      params: {}
    })
    transport.respond({ id: 'request-1', result: null })
    await finishPromise

    expect(transport.stopCalls).toBe(1)
  })

  it('exposes bridge errors as a typed class', () => {
    const error = new KwwkBridgeError('failed', 'ACTION_FAILED', { detail: true })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('KwwkBridgeError')
    expect(error.code).toBe('ACTION_FAILED')
    expect(error.data).toEqual({ detail: true })
  })
})
