import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getPathMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(() => tmpdir())
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  }
}))

import {
  cleanupDevServers,
  processGetDevServerStatus,
  processStartDevServer,
  processStopDevServer
} from '../DevServerProcessor'

interface ProcessFixture {
  directory: string
  statePath: string
}

interface FixtureState {
  leaderPid: number
  descendantPid: number
}

const fixtures: ProcessFixture[] = []
const descendantPids = new Set<number>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function waitFor<T>(
  read: () => T | null | Promise<T | null>,
  timeoutMs: number = 5000
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== null) return value
    await sleep(25)
  }
  throw new Error(`Condition was not met within ${timeoutMs} ms`)
}

async function waitForProcessExit(pid: number, timeoutMs: number = 4000): Promise<void> {
  await waitFor(() => isProcessAlive(pid) ? null : undefined, timeoutMs)
}

function createStubbornProcessGroupFixture(): ProcessFixture {
  const directory = mkdtempSync(join(tmpdir(), 'ati-dev-server-stop-'))
  const statePath = join(directory, 'state.json')
  const descendantPath = join(directory, 'descendant.cjs')
  const leaderPath = join(directory, 'leader.cjs')
  const previewPath = join(directory, 'preview.sh')

  writeFileSync(descendantPath, [
    "const { writeFileSync } = require('fs')",
    "process.on('SIGTERM', () => {})",
    `writeFileSync(${JSON.stringify(statePath)}, JSON.stringify({ leaderPid: Number(process.argv[2]), descendantPid: process.pid }))`,
    'setInterval(() => {}, 1000)'
  ].join('\n'))
  writeFileSync(leaderPath, [
    "const { spawn } = require('child_process')",
    `spawn(process.execPath, [${JSON.stringify(descendantPath)}, String(process.pid)], { stdio: 'ignore' })`,
    'setInterval(() => {}, 1000)'
  ].join('\n'))
  writeFileSync(previewPath, `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(leaderPath)}\n`)

  const fixture = { directory, statePath }
  fixtures.push(fixture)
  return fixture
}

function createExitedProcessGroupFixture(): ProcessFixture {
  const directory = mkdtempSync(join(tmpdir(), 'ati-dev-server-esrch-'))
  const statePath = join(directory, 'leader.pid')
  const previewPath = join(directory, 'preview.sh')

  writeFileSync(previewPath, `printf '%s' "$$" > ${JSON.stringify(statePath)}\n`)

  const fixture = { directory, statePath }
  fixtures.push(fixture)
  return fixture
}

async function readFixtureState(fixture: ProcessFixture): Promise<FixtureState> {
  const state = await waitFor(() => {
    if (!existsSync(fixture.statePath)) return null
    return JSON.parse(readFileSync(fixture.statePath, 'utf8')) as FixtureState
  })
  descendantPids.add(state.descendantPid)
  return state
}

afterEach(async () => {
  cleanupDevServers()

  for (const pid of descendantPids) {
    if (isProcessAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // The process exited between the liveness check and cleanup.
      }
    }
  }
  descendantPids.clear()

  for (const fixture of fixtures) {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
  fixtures.length = 0
  vi.restoreAllMocks()
})

describe.skipIf(process.platform === 'win32')('DevServerProcessor POSIX process groups', () => {
  it('waits for the shared stop lease until a stubborn descendant is force-killed', async () => {
    const chatUuid = 'stubborn-stop'
    const fixture = createStubbornProcessGroupFixture()

    expect(await processStartDevServer({
      chatUuid,
      customWorkspacePath: fixture.directory
    })).toMatchObject({ success: true })

    const { descendantPid } = await readFixtureState(fixture)
    expect(isProcessAlive(descendantPid)).toBe(true)

    const firstStop = processStopDevServer({ chatUuid })
    const secondStop = processStopDevServer({ chatUuid })
    let secondSettled = false
    void secondStop.then(() => {
      secondSettled = true
    })

    await sleep(100)
    expect(secondSettled).toBe(false)
    expect(isProcessAlive(descendantPid)).toBe(true)

    const [firstResult, secondResult] = await Promise.all([firstStop, secondStop])

    expect(firstResult).toMatchObject({ success: true })
    expect(secondResult).toMatchObject({ success: true })
    await waitForProcessExit(descendantPid)
    expect(await processGetDevServerStatus({ chatUuid })).toMatchObject({ status: 'idle' })
  }, 12000)

  it('force-kills registered process groups synchronously during app shutdown', async () => {
    const chatUuid = 'app-shutdown'
    const fixture = createStubbornProcessGroupFixture()

    expect(await processStartDevServer({
      chatUuid,
      customWorkspacePath: fixture.directory
    })).toMatchObject({ success: true })

    const { leaderPid, descendantPid } = await readFixtureState(fixture)
    const kill = vi.spyOn(process, 'kill')

    cleanupDevServers()

    expect(kill).toHaveBeenCalledWith(-leaderPid, 'SIGKILL')
    expect(kill.mock.calls.some(([pid, signal]) => pid > 0 && signal === 'SIGKILL')).toBe(false)
    await waitForProcessExit(descendantPid)
    expect(await processGetDevServerStatus({ chatUuid })).toMatchObject({ status: 'idle' })
  })

  it('treats ESRCH as a completed group cleanup without a positive-PID fallback', async () => {
    const chatUuid = 'already-exited'
    const fixture = createExitedProcessGroupFixture()
    const kill = vi.spyOn(process, 'kill')

    expect(await processStartDevServer({
      chatUuid,
      customWorkspacePath: fixture.directory
    })).toMatchObject({ success: true })

    const leaderPid = await waitFor(() => {
      if (!existsSync(fixture.statePath)) return null
      return Number(readFileSync(fixture.statePath, 'utf8'))
    })
    await waitFor(async () => {
      const status = await processGetDevServerStatus({ chatUuid })
      return status.status === 'error' ? true : null
    })

    expect(await processStopDevServer({ chatUuid })).toMatchObject({ success: true })
    expect(kill).toHaveBeenCalledWith(-leaderPid, 'SIGTERM')
    expect(kill.mock.calls.some(([pid]) => pid === leaderPid)).toBe(false)
  })

  it('retains a diagnostic state and permits retry after signaling fails', async () => {
    const chatUuid = 'stop-failure'
    const fixture = createStubbornProcessGroupFixture()

    expect(await processStartDevServer({
      chatUuid,
      customWorkspacePath: fixture.directory
    })).toMatchObject({ success: true })

    const { leaderPid, descendantPid } = await readFixtureState(fixture)
    const originalKill = process.kill.bind(process)
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === -leaderPid && signal === 'SIGTERM') {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
      }
      return originalKill(pid, signal)
    })

    const failedStop = await processStopDevServer({ chatUuid })

    expect(failedStop).toMatchObject({
      success: false,
      error: 'permission denied'
    })
    expect(await processGetDevServerStatus({ chatUuid })).toMatchObject({
      status: 'error',
      error: 'permission denied'
    })

    kill.mockRestore()
    expect(await processStopDevServer({ chatUuid })).toMatchObject({ success: true })
    await waitForProcessExit(descendantPid)
  }, 12000)
})
