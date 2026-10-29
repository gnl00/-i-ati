import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(),
  state: { mcpServerConfig: {} as McpServerConfig, savedMcpServerConfig: {} as McpServerConfig }
}))
vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeDbMcpServersGet: mocks.get, invokeDbMcpServersSave: mocks.save
}))
vi.mock('@renderer/infrastructure/config/appConfig', () => ({ useAppConfigStore: {
  getState: (): typeof mocks.state => mocks.state,
  setState: (update: (state: typeof mocks.state) => Partial<typeof mocks.state>): void => {
    Object.assign(mocks.state, update(mocks.state))
  }
} }))
import { setMcpServerEnabled } from '../mcpEnablement'

let persisted: McpServerConfig
beforeEach(() => {
  vi.clearAllMocks()
  persisted = { mcpServers: { first: { command: 'first' }, second: { command: 'second' } } }
  mocks.state = { savedMcpServerConfig: structuredClone(persisted),
    mcpServerConfig: { mcpServers: { ...persisted.mcpServers, first: { command: 'unsaved-edit' } } } }
  mocks.get.mockImplementation(async () => structuredClone(persisted))
  mocks.save.mockImplementation(async (next: McpServerConfig) => { persisted = next })
})

it('persists enablement across launches while preserving unsaved transport edits and other servers', async () => {
  await setMcpServerEnabled('first', true)
  expect(persisted.mcpServers?.first).toEqual({ command: 'first', enabled: true })
  expect(persisted.mcpServers?.second).toEqual({ command: 'second' })
  expect(mocks.state.mcpServerConfig.mcpServers?.first).toEqual({ command: 'unsaved-edit', enabled: true })
  expect(mocks.state.savedMcpServerConfig).toEqual(persisted)
  await setMcpServerEnabled('first', false)
  expect(persisted.mcpServers?.first.enabled).toBe(false)
})

it('serializes concurrent toggles and does not publish an unsaved preference on persistence failure', async () => {
  await Promise.all([setMcpServerEnabled('first', true), setMcpServerEnabled('second', true)])
  expect(persisted.mcpServers?.first.enabled).toBe(true)
  expect(persisted.mcpServers?.second.enabled).toBe(true)
  mocks.save.mockRejectedValueOnce(new Error('disk full'))
  await expect(setMcpServerEnabled('first', false)).rejects.toThrow('disk full')
  expect(mocks.state.mcpServerConfig.mcpServers?.first.enabled).toBe(true)
})
