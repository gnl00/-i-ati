import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(), disconnect: vi.fn(), initialize: vi.fn(), close: vi.fn(),
  viewStart: vi.fn(), viewExit: vi.fn(), warn: vi.fn(),
  state: { notice: '', chat: { uuid: 'test' }, onChange: vi.fn() },
  servers: {} as Record<string, { command: string; enabled?: boolean }>,
  sessions: [] as Array<{ mcpTools: { name: string }[] }>
}))
vi.mock('electron', () => ({ app: {
  getPath: (): string => '/tmp', setName: vi.fn(), setPath: vi.fn(), whenReady: async (): Promise<void> => {}
} }))
vi.mock('node:fs/promises', () => ({
  mkdir: async (): Promise<void> => {}, realpath: async (path: string): Promise<string> => path,
  stat: async (): Promise<{ isDirectory(): boolean }> => ({ isDirectory: () => true })
}))
vi.mock('@main/logging/LogService', () => ({ logService: {
  initialize: vi.fn(), close: vi.fn(), setAdditionalRedactionSecrets: vi.fn(),
  createLogger: (): { info: ReturnType<typeof vi.fn>; warn: typeof mocks.warn } => ({ info: vi.fn(), warn: mocks.warn })
} }))
vi.mock('@main/db/runtime', () => ({ databaseRuntime: { initialize: vi.fn(), close: vi.fn() } }))
vi.mock('@main/db/config', () => ({ configDb: {
  initConfig: (): { accounts: ProviderAccount[] } => ({ accounts: [] }), getMcpServerConfig: (): McpServerConfig => ({ mcpServers: mocks.servers })
} }))
vi.mock('@main/tools', () => ({ initializeMainEmbeddedTools: vi.fn() }))
vi.mock('@main/services/shellEnvironment', () => ({ preserveCallerShellPathForCommands: vi.fn() }))
vi.mock('@main/tools/command/CommandProcessor', () => ({ setCommandWorkspaceBasePath: vi.fn() }))
vi.mock('@main/services/command/CommandProcessRunner', () => ({ waitForCommandProcessCleanup: vi.fn() }))
vi.mock('@main/services/mcpRuntime', () => ({ mcpRuntimeService: {
  connectServer: mocks.connect, disconnectAll: mocks.disconnect
} }))
vi.mock('@main/orchestration/tui/TuiSession', () => ({ TuiSession: class {
  state = mocks.state
  mcpTools: { name: string }[] = []
  initialize = mocks.initialize
  close = mocks.close
  constructor() { mocks.sessions.push(this) }
} }))
vi.mock('@main/hosts/tui/TuiView', () => ({ TuiView: class {
  start = mocks.viewStart
  exit = mocks.viewExit
} }))
vi.mock('@main/services/skills/SkillService', () => ({ SkillService: { initializeFromConfig: vi.fn() } }))
vi.mock('@main/services/memory/MemoryService', () => ({ default: { initialize: vi.fn() } }))
vi.mock('@main/services/knowledgebase/KnowledgebaseService', () => ({ knowledgebaseService: { initialize: vi.fn() } }))
vi.mock('@main/services/subagent/subagent-run-service', () => ({ default: { initialize: vi.fn(), shutdown: vi.fn() } }))

import { runTuiApplication } from '../TuiApplication'

let finishView: () => void = () => {}
const pendingConnections: (() => void)[] = []
let running: Promise<number> | undefined
const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
beforeEach(() => {
  vi.clearAllMocks()
  finishView = (): void => {}
  pendingConnections.length = 0
  mocks.servers = { slow: { command: 'slow', enabled: true }, healthy: { command: 'healthy', enabled: true }, broken: { command: 'broken', enabled: true }, disabled: { command: 'disabled', enabled: false }, legacy: { command: 'legacy' } }
  mocks.sessions.length = 0
  mocks.state.notice = ''
  mocks.viewStart.mockImplementation(() => new Promise<void>(resolve => { finishView = resolve }))
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true })
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})
afterEach(async () => {
  finishView?.()
  for (const release of pendingConnections) release()
  await running
  running = undefined
  for (const [stream, descriptor] of [[process.stdin, stdinTty], [process.stdout, stdoutTty]] as const) {
    if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor)
    else Reflect.deleteProperty(stream, 'isTTY')
  }
  vi.restoreAllMocks()
})

it('renders before MCP resolves, connects servers concurrently, and keeps healthy tools after a failure', async () => {
  mocks.connect.mockImplementation(async ({ name }, options?: { signal: AbortSignal }) => {
    if (name === 'slow') await new Promise<void>(resolve => {
      pendingConnections.push(resolve)
      options?.signal.addEventListener('abort', () => resolve(), { once: true })
    })
    return name === 'healthy'
      ? { result: true, tools: [{ function: { name: 'healthy__search' }, source: 'mcp', serverName: name, originalName: 'search' }] }
      : { result: false, msg: `${name} unavailable` }
  })
  running = runTuiApplication(['--workspace', '/workspace'])
  try {
    await vi.waitFor(() => expect(mocks.viewStart).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(3))
    await vi.waitFor(() => expect(mocks.sessions[0].mcpTools).toContainEqual(expect.objectContaining({ name: 'healthy__search' })))
    expect(mocks.state.notice).toContain('broken')
    expect(mocks.warn).toHaveBeenCalledWith('MCP connection failed', expect.objectContaining({ serverName: 'broken', error: 'broken unavailable' }))
    finishView()
    expect(await running).toBe(0)
    expect(mocks.connect.mock.calls[0][1].signal.aborted).toBe(true)
    expect(mocks.disconnect).toHaveBeenCalledOnce()
  } finally { finishView?.() }
})

it('isolates thrown MCP errors and exits cleanly while a connection is pending', async () => {
  mocks.connect.mockImplementation(async ({ name }, options?: { signal: AbortSignal }) => {
    if (name === 'broken') throw new Error('MCP discovery failed')
    await new Promise<void>(resolve => {
      pendingConnections.push(resolve)
      options?.signal.addEventListener('abort', () => resolve(), { once: true })
    })
    return { result: false, msg: 'cancelled' }
  })
  running = runTuiApplication(['--workspace', '/workspace'])
  try {
    await vi.waitFor(() => expect(mocks.viewStart).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(mocks.state.notice).toContain('broken'))
    finishView()
    expect(await running).toBe(0)
    expect(mocks.connect.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true)
  } finally { finishView?.() }
})
