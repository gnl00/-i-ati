// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useMcpRuntimeStore } from '../mcpRuntimeStore'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(), disconnect: vi.fn(), enable: vi.fn(),
  loaded: true
}))
vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeMcpConnect: mocks.connect, invokeMcpDisconnect: mocks.disconnect, invokeMcpStatus: vi.fn()
}))
vi.mock('../mcpEnablement', () => ({ setMcpServerEnabled: mocks.enable }))
vi.mock('@renderer/infrastructure/config/appConfig', () => ({ useAppConfigStore: {
  getState: (): { mcpConfigLoaded: boolean } => ({ mcpConfigLoaded: mocks.loaded })
} }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
import { useMcpConnection } from '../useMcpConnection'

let hook: ReturnType<typeof useMcpConnection>
let root: ReturnType<typeof createRoot>
let element: HTMLDivElement
function Probe(): null { hook = useMcpConnection(); return null }
beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.loaded = true
  mocks.connect.mockResolvedValue({ result: true, tools: [], msg: 'connected' })
  useMcpRuntimeStore.setState({ selectedServerNames: [], connectingServerNames: [],
    availableMcpTools: new Map(), lastErrorByServer: {} })
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  await act(async () => root.render(<Probe />))
})
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.unstubAllGlobals() })

it('auto-connects only explicitly enabled servers after config hydration', async () => {
  const config = { mcpServers: { enabled: { command: 'enabled', enabled: true },
    disabled: { command: 'disabled', enabled: false }, legacy: { command: 'legacy' } } }
  mocks.loaded = false
  await act(async () => { await hook.syncWithConfig(config) })
  expect(mocks.connect).not.toHaveBeenCalled()
  mocks.loaded = true
  await act(async () => { await hook.syncWithConfig(config) })
  expect(mocks.connect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'enabled' }))
})

it('can disable an enabled server even after its connection failed', async () => {
  await act(async () => { await hook.toggle('failed', { command: 'failed', enabled: true }) })
  expect(mocks.enable).toHaveBeenCalledWith('failed', false)
  expect(mocks.disconnect).toHaveBeenCalledExactlyOnceWith({ name: 'failed' })
  expect(mocks.connect).not.toHaveBeenCalled()
})
