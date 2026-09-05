import { describe, expect, it, vi } from 'vitest'
import { computerUseActions } from '@tools/computerUse/actions'
import type { ComputerUseBackend } from '@main/services/computerUse'
import { ComputerUseToolsProcessor } from '../ComputerUseToolsProcessor'
import {
  resolveComputerUseBackend,
  resetComputerUseBackendForTests
} from '../ComputerUseBackendFactory'

const createBackend = (): ComputerUseBackend => ({
  diagnostics: vi.fn(async () => ({
    helperPath: '/tmp/kwwk-computer-use-bridge',
    permissions: {
      accessibilityTrusted: true,
      screenCaptureTrusted: false
    },
    codeSigning: {
      signed: true,
      identifier: 'com.example.bridge'
    }
  })),
  requestPermissions: vi.fn(async () => ({
    accessibilityTrusted: true,
    screenCaptureTrusted: true
  })),
  listApps: vi.fn(async () => [
    { name: 'Finder', bundleId: 'com.apple.finder' }
  ]),
  runningApps: vi.fn(async () => [{ name: 'Finder', pid: 1 }]),
  openApp: vi.fn(async input => ({ text: `opened ${input.app}` })),
  listWindows: vi.fn(async input => [{ appName: input.app, title: 'Main' }]),
  state: vi.fn(async input => ({
    metadata: { id: 'snapshot-1', app: input.app },
    nodes: [{ index: 1, role: 'AXButton', title: 'OK' }]
  })),
  clickElement: vi.fn(async input => ({
    text: `clicked ${input.elementIndex}`
  })),
  clickCoordinate: vi.fn(async input => ({
    text: `clicked ${input.x},${input.y}`
  })),
  typeText: vi.fn(async input => ({ text: input.text })),
  setValue: vi.fn(async input => ({ text: input.value })),
  pressKey: vi.fn(async input => ({ text: input.key })),
  scroll: vi.fn(async input => ({ text: input.direction })),
  drag: vi.fn(async input => ({ text: `${input.fromX}->${input.toX}` })),
  finish: vi.fn(async () => {})
})

describe('ComputerUseToolsProcessor', () => {
  const actionCases = [
    ['status', 'diagnostics', {}],
    ['request_permissions', 'requestPermissions', {}],
    ['apps', 'listApps', {}],
    ['running_apps', 'runningApps', {}],
    ['open_app', 'openApp', { app: 'Finder' }],
    ['windows', 'listWindows', { app: 'Finder' }],
    ['state', 'state', { app: 'Finder', includeScreenshot: true }],
    ['click_element', 'clickElement', { snapshotId: 's1', elementIndex: 1 }],
    ['click_coordinate', 'clickCoordinate', { snapshotId: 's1', x: 0, y: 2 }],
    ['type_text', 'typeText', { snapshotId: 's1', text: 'hello' }],
    [
      'set_value',
      'setValue',
      { snapshotId: 's1', elementIndex: 1, value: 'hello' }
    ],
    ['press_key', 'pressKey', { snapshotId: 's1', key: 'Command+L' }],
    [
      'scroll',
      'scroll',
      { snapshotId: 's1', elementIndex: 1, direction: 'down', pages: 2 }
    ],
    ['drag', 'drag', { snapshotId: 's1', fromX: 0, fromY: 1, toX: 2, toY: 3 }],
    ['finish', 'finish', {}]
  ] as const

  it.each(actionCases)(
    'dispatches %s and returns its action',
    async (action, method, fields) => {
      const backend = createBackend()
      const processor = new ComputerUseToolsProcessor({ backend })
      const result = await processor.execute({ action, ...fields })
      expect(result).toMatchObject({ success: true, backend: 'kwwk', action })
      expect(backend[method]).toHaveBeenCalledTimes(1)
      if (Object.keys(fields).length) {
        expect(backend[method]).toHaveBeenCalledWith(
          expect.objectContaining(fields)
        )
      }
      expect(
        Object.values(backend).filter(fn => vi.mocked(fn).mock.calls.length)
      ).toHaveLength(1)
    }
  )

  it('validates every action requirement before calling the backend', async () => {
    for (const [action, , fields] of actionCases) {
      for (const key of computerUseActions[action].required) {
        const args: Record<string, unknown> = { action, ...fields }
        delete args[key]
        const backend = createBackend()
        const result = await new ComputerUseToolsProcessor({ backend }).execute(
          args
        )
        expect(result).toMatchObject({ success: false, action })
        expect(result.error).toContain(key)
        for (const method of Object.values(backend))
          expect(method).not.toHaveBeenCalled()
      }
    }
  })

  it.each([
    null,
    [],
    {},
    { action: 3 },
    { action: 'unknown' },
    { action: 'toString' },
    { action: 'status', app: 'Finder' },
    { action: 'state', app: 'Finder', includeScreenshot: 'yes' },
    { action: 'state', app: 'Finder', windowId: Infinity },
    { action: 'click_coordinate', snapshotId: 's1', x: NaN, y: 2 },
    { action: 'click_element', snapshotId: '', elementIndex: 1 },
    {
      action: 'scroll',
      snapshotId: 's1',
      elementIndex: 1,
      direction: 'diagonal'
    }
  ])('returns a structured validation error for %j', async args => {
    const backend = createBackend()
    const result = await new ComputerUseToolsProcessor({ backend }).execute(
      args
    )
    expect(result).toMatchObject({
      success: false,
      backend: 'kwwk',
      error: expect.any(String)
    })
    for (const method of Object.values(backend))
      expect(method).not.toHaveBeenCalled()
  })

  it('preserves action and backend failure details', async () => {
    const backend = createBackend()
    vi.mocked(backend.clickCoordinate).mockRejectedValue(
      new Error('Screenshot-backed snapshot required')
    )
    const result = await new ComputerUseToolsProcessor({ backend }).execute({
      action: 'click_coordinate',
      snapshotId: 's1',
      x: 1,
      y: 2
    })
    expect(result).toEqual({
      success: false,
      backend: 'kwwk',
      action: 'click_coordinate',
      error: 'Screenshot-backed snapshot required'
    })
  })

  it('returns runtime diagnostics and permission request results', async () => {
    const backend = createBackend()
    const processor = new ComputerUseToolsProcessor({ backend })

    const status = await processor.status()
    const permissions = await processor.requestPermissions()

    expect(status).toEqual({
      success: true,
      backend: 'kwwk',
      result: {
        helperPath: '/tmp/kwwk-computer-use-bridge',
        permissions: {
          accessibilityTrusted: true,
          screenCaptureTrusted: false
        },
        codeSigning: {
          signed: true,
          identifier: 'com.example.bridge'
        }
      }
    })
    expect(permissions).toEqual({
      success: true,
      backend: 'kwwk',
      result: {
        accessibilityTrusted: true,
        screenCaptureTrusted: true
      }
    })
  })

  it('maps state args to the backend', async () => {
    const backend = createBackend()
    const processor = new ComputerUseToolsProcessor({ backend })

    const result = await processor.state({
      app: 'Finder',
      windowTitle: 'Main',
      windowId: 12,
      includeScreenshot: true
    })

    expect(result.success).toBe(true)
    expect(result.backend).toBe('kwwk')
    expect(backend.state).toHaveBeenCalledWith({
      app: 'Finder',
      windowTitle: 'Main',
      windowId: 12,
      includeScreenshot: true
    })
  })

  it('maps element and coordinate clicks to separate backend calls', async () => {
    const backend = createBackend()
    const processor = new ComputerUseToolsProcessor({ backend })

    await processor.clickElement({
      snapshotId: 'snapshot-1',
      elementIndex: 3,
      includeScreenshotAfter: true
    })
    await processor.clickCoordinate({
      snapshotId: 'snapshot-1',
      x: 10,
      y: 20
    })

    expect(backend.clickElement).toHaveBeenCalledWith({
      snapshotId: 'snapshot-1',
      elementIndex: 3,
      includeScreenshotAfter: true
    })
    expect(backend.clickCoordinate).toHaveBeenCalledWith({
      snapshotId: 'snapshot-1',
      x: 10,
      y: 20,
      includeScreenshotAfter: undefined
    })
  })

  it('returns backend errors as failed tool responses', async () => {
    const backend = createBackend()
    vi.mocked(backend.openApp).mockRejectedValue(
      new Error('AX permission missing')
    )
    const processor = new ComputerUseToolsProcessor({ backend })

    const result = await processor.openApp({ app: 'Finder' })

    expect(result).toEqual({
      success: false,
      backend: 'kwwk',
      error: 'AX permission missing'
    })
  })

  it('maps text, value, key, scroll, drag, and finish actions', async () => {
    const backend = createBackend()
    const processor = new ComputerUseToolsProcessor({ backend })

    await processor.typeText({
      snapshotId: 'snapshot-1',
      text: 'hello',
      elementIndex: 2
    })
    await processor.setValue({
      snapshotId: 'snapshot-1',
      elementIndex: 2,
      value: 'value'
    })
    await processor.pressKey({ snapshotId: 'snapshot-1', key: 'Enter' })
    await processor.scroll({
      snapshotId: 'snapshot-1',
      elementIndex: 4,
      direction: 'down',
      pages: 2
    })
    await processor.drag({
      snapshotId: 'snapshot-1',
      fromX: 1,
      fromY: 2,
      toX: 3,
      toY: 4
    })
    const finish = await processor.finish()

    expect(backend.typeText).toHaveBeenCalledWith({
      snapshotId: 'snapshot-1',
      text: 'hello',
      elementIndex: 2,
      includeScreenshotAfter: undefined
    })
    expect(backend.setValue).toHaveBeenCalledWith({
      snapshotId: 'snapshot-1',
      elementIndex: 2,
      value: 'value',
      includeScreenshotAfter: undefined
    })
    expect(backend.pressKey).toHaveBeenCalledWith({
      snapshotId: 'snapshot-1',
      key: 'Enter',
      includeScreenshotAfter: undefined
    })
    expect(backend.scroll).toHaveBeenCalledWith({
      snapshotId: 'snapshot-1',
      elementIndex: 4,
      direction: 'down',
      pages: 2,
      includeScreenshotAfter: undefined
    })
    expect(backend.drag).toHaveBeenCalledWith({
      snapshotId: 'snapshot-1',
      fromX: 1,
      fromY: 2,
      toX: 3,
      toY: 4,
      includeScreenshotAfter: undefined
    })
    expect(finish).toEqual({
      success: true,
      backend: 'kwwk',
      result: { finished: true }
    })
  })

  it('rejects unsupported backend selector values', () => {
    resetComputerUseBackendForTests()
    const previous = process.env.ATI_COMPUTER_USE_BACKEND
    process.env.ATI_COMPUTER_USE_BACKEND = 'unknown'

    try {
      expect(() => resolveComputerUseBackend()).toThrow(
        'Unsupported computer-use backend'
      )
    } finally {
      if (previous === undefined) {
        delete process.env.ATI_COMPUTER_USE_BACKEND
      } else {
        process.env.ATI_COMPUTER_USE_BACKEND = previous
      }
      resetComputerUseBackendForTests()
    }
  })
})
