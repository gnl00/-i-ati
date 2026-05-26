import { describe, expect, it, vi } from 'vitest'
import type { ComputerUseBackend, ComputerUseState } from '../../ComputerUseBackend'
import { ComputerUseProbeRunner } from '../ComputerUseProbeRunner'

const state = (id: string, focusedIndex?: number): ComputerUseState => ({
  metadata: { id },
  nodes: [
    {
      index: 1,
      role: 'AXButton',
      title: 'Reload',
      identifier: 'reload-button',
      focused: focusedIndex === 1
    },
    {
      index: 2,
      role: 'AXTextField',
      title: 'Address',
      identifier: 'address-field',
      focused: focusedIndex === 2
    }
  ]
})

const createBackend = (overrides: Partial<ComputerUseBackend> = {}): ComputerUseBackend => ({
  diagnostics: vi.fn(async () => ({
    permissions: {
      accessibilityTrusted: true,
      screenCaptureTrusted: true
    }
  })),
  requestPermissions: vi.fn(async () => ({
    accessibilityTrusted: true,
    screenCaptureTrusted: true
  })),
  listApps: vi.fn(async () => []),
  runningApps: vi.fn(async () => []),
  openApp: vi.fn(async () => ({ text: 'opened' })),
  listWindows: vi.fn(async () => []),
  state: vi.fn(async () => state('before')),
  clickElement: vi.fn(async () => ({ text: 'clicked' })),
  clickCoordinate: vi.fn(async () => ({ text: 'clicked coordinate' })),
  typeText: vi.fn(async () => ({ text: 'typed' })),
  setValue: vi.fn(async () => ({ text: 'set' })),
  pressKey: vi.fn(async () => ({ text: 'pressed' })),
  scroll: vi.fn(async () => ({ text: 'scrolled' })),
  drag: vi.fn(async () => ({ text: 'dragged' })),
  finish: vi.fn(async () => {}),
  ...overrides
})

describe('ComputerUseProbeRunner', () => {
  it('runs state -> click -> state and passes when the snapshot changes', async () => {
    const backend = createBackend({
      state: vi.fn()
        .mockResolvedValueOnce(state('before', 1))
        .mockResolvedValueOnce(state('after', 2))
    })
    const runner = new ComputerUseProbeRunner(backend)

    const result = await runner.run([{
      name: 'chrome-reload',
      app: 'Google Chrome',
      target: {
        role: 'AXButton',
        titleIncludes: 'Reload'
      }
    }])

    expect(result.status).toBe('passed')
    expect(result.scenarios[0]).toMatchObject({
      status: 'passed',
      selectedElementIndex: 1,
      beforeSnapshotId: 'before',
      afterSnapshotId: 'after',
      changed: true
    })
    expect(backend.clickElement).toHaveBeenCalledWith({
      snapshotId: 'before',
      elementIndex: 1,
      includeScreenshotAfter: true
    })
  })

  it('falls back to app candidates when the primary app name cannot be opened', async () => {
    const backend = createBackend({
      openApp: vi.fn()
        .mockRejectedValueOnce(new Error('appNotFound Finder'))
        .mockResolvedValueOnce({ text: 'opened' }),
      state: vi.fn()
        .mockResolvedValueOnce(state('before', 1))
        .mockResolvedValueOnce(state('after', 2))
    })
    const runner = new ComputerUseProbeRunner(backend)

    const result = await runner.run([{
      name: 'finder-back',
      app: 'Finder',
      appCandidates: ['com.apple.finder'],
      target: {
        role: 'AXButton',
        titleIncludes: 'Reload'
      }
    }])

    expect(result.status).toBe('passed')
    expect(result.scenarios[0]).toMatchObject({
      status: 'passed',
      resolvedApp: 'com.apple.finder'
    })
    expect(backend.openApp).toHaveBeenNthCalledWith(1, { app: 'Finder' })
    expect(backend.openApp).toHaveBeenNthCalledWith(2, { app: 'com.apple.finder' })
    expect(backend.state).toHaveBeenNthCalledWith(1, expect.objectContaining({
      app: 'com.apple.finder'
    }))
  })

  it('skips scenarios when required permissions are missing', async () => {
    const backend = createBackend({
      diagnostics: vi.fn(async () => ({
        permissions: {
          accessibilityTrusted: false,
          screenCaptureTrusted: true
        }
      }))
    })
    const runner = new ComputerUseProbeRunner(backend)

    const result = await runner.run([{
      name: 'finder',
      app: 'Finder',
      target: { titleIncludes: 'Documents' }
    }])

    expect(result.status).toBe('passed')
    expect(result.scenarios[0]).toMatchObject({
      status: 'skipped',
      changed: false
    })
    expect(backend.openApp).not.toHaveBeenCalled()
  })

  it('passes state-only scenarios after the first snapshot', async () => {
    const backend = createBackend({
      state: vi.fn(async () => state('before'))
    })
    const runner = new ComputerUseProbeRunner(backend)

    const result = await runner.run([{
      name: 'finder-state',
      app: 'com.apple.finder',
      action: 'state'
    }])

    expect(result.status).toBe('passed')
    expect(result.scenarios[0]).toMatchObject({
      status: 'passed',
      beforeSnapshotId: 'before',
      beforeNodeCount: 2
    })
    expect(backend.clickElement).not.toHaveBeenCalled()
  })

  it('fails when the target element cannot be resolved', async () => {
    const backend = createBackend({
      state: vi.fn(async () => state('before'))
    })
    const runner = new ComputerUseProbeRunner(backend)

    const result = await runner.run([{
      name: 'missing-target',
      app: 'Finder',
      target: { titleIncludes: 'Missing' }
    }])

    expect(result.status).toBe('failed')
    expect(result.scenarios[0].steps).toContainEqual(expect.objectContaining({
      name: 'resolve_target',
      status: 'failed'
    }))
  })

  it('matches targets by description and value text', async () => {
    const backend = createBackend({
      state: vi.fn()
        .mockResolvedValueOnce({
          metadata: { id: 'before' },
          nodes: [{
            index: 3,
            role: 'AXTextField',
            title: '',
            description: 'Address and search bar',
            value: 'https://example.com',
            identifier: 'omnibox',
            focused: true
          }]
        })
        .mockResolvedValueOnce(state('after', 2))
    })
    const runner = new ComputerUseProbeRunner(backend)

    const result = await runner.run([{
      name: 'chrome-address',
      app: 'Google Chrome',
      target: {
        role: 'AXTextField',
        descriptionIncludes: ['Address', '地址'],
        valueIncludes: 'example.com'
      }
    }])

    expect(result.status).toBe('passed')
    expect(result.scenarios[0].selectedElementIndex).toBe(3)
  })

  it('can pass a click scenario without requiring a changed snapshot', async () => {
    const backend = createBackend({
      state: vi.fn(async () => state('same', 1))
    })
    const runner = new ComputerUseProbeRunner(backend)

    const result = await runner.run([{
      name: 'stable-click',
      app: 'Finder',
      expectChange: false,
      target: { elementIndex: 1 }
    }])

    expect(result.status).toBe('passed')
    expect(result.scenarios[0]).toMatchObject({
      status: 'passed',
      changed: false
    })
    expect(result.scenarios[0].steps).toContainEqual(expect.objectContaining({
      name: 'state_after',
      status: 'passed'
    }))
  })

  it('fails when the post-click snapshot fingerprint is unchanged', async () => {
    const backend = createBackend({
      state: vi.fn(async () => state('same', 1))
    })
    const runner = new ComputerUseProbeRunner(backend)

    const result = await runner.run([{
      name: 'unchanged',
      app: 'Finder',
      target: { elementIndex: 1 }
    }])

    expect(result.status).toBe('failed')
    expect(result.scenarios[0]).toMatchObject({
      status: 'failed',
      changed: false
    })
    expect(result.scenarios[0].steps).toContainEqual(expect.objectContaining({
      name: 'state_after',
      status: 'failed'
    }))
  })
})
