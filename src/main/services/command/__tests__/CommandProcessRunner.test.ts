import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  COMMAND_OUTPUT_LIMIT_BYTES,
  COMMAND_TERMINATION_GRACE_MS,
  CommandProcessSpawnError,
  runCommandProcess
} from '../CommandProcessRunner'

const baseOptions = {
  executable: process.execPath,
  cwd: process.cwd(),
  env: process.env,
  timeoutMs: 5_000
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Process ${pid} remained alive after ${timeoutMs}ms`)
}

function createProcessGroupFixtureScript(readyPath: string): string {
  const descendantScript = [
    'const fs = require("node:fs");',
    'process.on("SIGTERM", () => {});',
    `fs.writeFileSync(${JSON.stringify(readyPath)}, "ready");`,
    'setInterval(() => {}, 1000);'
  ].join('')

  return [
    'const { spawn } = require("node:child_process");',
    'const fs = require("node:fs");',
    `const child = spawn(process.execPath, ["-e", ${JSON.stringify(descendantScript)}], {`,
    'stdio: "ignore"',
    '});',
    'const timer = setInterval(() => {',
    `if (!fs.existsSync(${JSON.stringify(readyPath)})) return;`,
    'clearInterval(timer);',
    'process.stdout.write(String(child.pid) + "\\n");',
    'setInterval(() => {}, 1000);',
    '}, 10);'
  ].join('')
}

async function verifyDescendantCleanup(reason: 'timeout' | 'abort'): Promise<void> {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'command-process-runner-'))
  const readyPath = join(fixtureDirectory, 'descendant-ready')
  const controller = new AbortController()
  let streamedOutput = ''
  let descendantPid: number | undefined

  try {
    const result = await runCommandProcess({
      ...baseOptions,
      args: ['-e', createProcessGroupFixtureScript(readyPath)],
      timeoutMs: reason === 'timeout' ? 1_000 : 10_000,
      signal: controller.signal,
      onOutput: (chunk) => {
        if (chunk.stream !== 'stdout') return
        streamedOutput += chunk.text
        const candidatePid = Number(streamedOutput.trim())
        if (!Number.isInteger(candidatePid)) return
        descendantPid = candidatePid
        if (reason === 'abort') controller.abort()
      }
    })

    descendantPid ??= Number(result.stdout.trim())
    if (!Number.isInteger(descendantPid) || descendantPid <= 0) {
      throw new Error(`Fixture did not report a descendant PID: ${result.stdout}`)
    }
    expect(result).toMatchObject({
      timedOut: reason === 'timeout',
      aborted: reason === 'abort'
    })
    expect(isProcessAlive(descendantPid)).toBe(true)
    await waitForProcessExit(descendantPid, COMMAND_TERMINATION_GRACE_MS + 2_000)
  } finally {
    if (descendantPid && isProcessAlive(descendantPid)) {
      try {
        process.kill(descendantPid, 'SIGKILL')
      } catch {
        // The cleanup lease may complete between the liveness check and this fallback.
      }
    }
    rmSync(fixtureDirectory, { recursive: true, force: true })
  }
}

describe('CommandProcessRunner', () => {
  it('streams decoded UTF-8 output and returns the terminal result on close', async () => {
    const chunks: Array<{ stream: 'stdout' | 'stderr'; text: string }> = []
    const script = [
      'process.stdout.write(Buffer.from([0xe4, 0xbd]));',
      'setTimeout(() => {',
      'process.stdout.write(Buffer.from([0xa0]));',
      'process.stderr.write("warning");',
      '}, 10);'
    ].join('')

    const result = await runCommandProcess({
      ...baseOptions,
      args: ['-e', script],
      onOutput: (chunk) => chunks.push(chunk)
    })

    expect(result).toMatchObject({
      stdout: '你',
      stderr: 'warning',
      stdoutBytes: 3,
      stderrBytes: 7,
      stdoutTruncated: false,
      stderrTruncated: false,
      exitCode: 0,
      terminationSignal: null,
      timedOut: false,
      aborted: false
    })
    expect(chunks.filter((chunk) => chunk.stream === 'stdout').map((chunk) => chunk.text).join(''))
      .toBe('你')
    expect(chunks.filter((chunk) => chunk.stream === 'stderr').map((chunk) => chunk.text).join(''))
      .toBe('warning')
  })

  it('bounds stdout and stderr with head-tail retention and records original byte counts', async () => {
    const outputBytes = COMMAND_OUTPUT_LIMIT_BYTES + 64 * 1024
    const script = [
      `process.stdout.write("HEAD" + "o".repeat(${outputBytes - 8}) + "TAIL");`,
      `process.stderr.write("BEGIN" + "e".repeat(${outputBytes - 8}) + "END");`
    ].join('')

    const result = await runCommandProcess({
      ...baseOptions,
      args: ['-e', script]
    })

    expect(result.stdoutBytes).toBe(outputBytes)
    expect(result.stderrBytes).toBe(outputBytes)
    expect(result.stdoutTruncated).toBe(true)
    expect(result.stderrTruncated).toBe(true)
    expect(Buffer.byteLength(result.stdout)).toBeLessThan(COMMAND_OUTPUT_LIMIT_BYTES + 100)
    expect(Buffer.byteLength(result.stderr)).toBeLessThan(COMMAND_OUTPUT_LIMIT_BYTES + 100)
    expect(result.stdout).toMatch(/^HEAD/)
    expect(result.stdout).toMatch(/TAIL$/)
    expect(result.stderr).toMatch(/^BEGIN/)
    expect(result.stderr).toMatch(/END$/)
    expect(result.stdout).toContain(`[command output truncated; ${outputBytes} original bytes]`)
  })

  it('keeps truncated UTF-8 head and tail captures on character boundaries', async () => {
    const script = `process.stdout.write("你".repeat(${COMMAND_OUTPUT_LIMIT_BYTES}))`

    const result = await runCommandProcess({
      ...baseOptions,
      args: ['-e', script]
    })

    expect(result.stdoutTruncated).toBe(true)
    expect(result.stdout).not.toContain('\uFFFD')
    expect(result.stdout).toMatch(/^你/)
    expect(result.stdout).toMatch(/你$/)
  })

  it('returns non-zero exit codes with captured stderr', async () => {
    const result = await runCommandProcess({
      ...baseOptions,
      args: ['-e', 'process.stderr.write("failed"); process.exitCode = 7']
    })

    expect(result).toMatchObject({
      stderr: 'failed',
      exitCode: 7,
      terminationSignal: null,
      timedOut: false,
      aborted: false
    })
  })

  it('terminates a timed-out process and reports the timeout', async () => {
    const result = await runCommandProcess({
      ...baseOptions,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      timeoutMs: 50
    })

    expect(result.timedOut).toBe(true)
    expect(result.aborted).toBe(false)
    expect(result.terminationSignal).toMatch(/^SIG/)
    expect(result.executionTimeMs).toBeLessThan(2_000)
  })

  it('terminates a process when the caller aborts', async () => {
    const controller = new AbortController()
    const execution = runCommandProcess({
      ...baseOptions,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      signal: controller.signal
    })
    setTimeout(() => controller.abort(), 50)

    const result = await execution

    expect(result.aborted).toBe(true)
    expect(result.timedOut).toBe(false)
    expect(result.terminationSignal).toMatch(/^SIG/)
  })

  it.skipIf(process.platform === 'win32')(
    'keeps the timeout cleanup lease after the leader closes and kills descendants',
    async () => {
      await verifyDescendantCleanup('timeout')
    },
    10_000
  )

  it.skipIf(process.platform === 'win32')(
    'keeps the abort cleanup lease after the leader closes and kills descendants',
    async () => {
      await verifyDescendantCleanup('abort')
    },
    10_000
  )

  it.skipIf(process.platform === 'win32')(
    'keeps delayed escalation scoped to the process group after ESRCH',
    async () => {
      const originalKill = process.kill.bind(process)
      const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
        if (pid < 0 && signal === 'SIGKILL') {
          throw Object.assign(new Error('Process group already exited'), { code: 'ESRCH' })
        }
        return originalKill(pid, signal)
      })

      try {
        const result = await runCommandProcess({
          ...baseOptions,
          args: ['-e', 'setInterval(() => {}, 1000)'],
          timeoutMs: 50
        })
        expect(result.timedOut).toBe(true)

        await new Promise((resolve) => setTimeout(resolve, COMMAND_TERMINATION_GRACE_MS + 100))

        const termCall = kill.mock.calls.find(([pid, signal]) => pid < 0 && signal === 'SIGTERM')
        expect(termCall).toBeDefined()
        const processGroupId = -(termCall?.[0] ?? 0)
        expect(kill).toHaveBeenCalledWith(-processGroupId, 'SIGKILL')
        expect(kill.mock.calls.some(
          ([pid, signal]) => pid === processGroupId && signal === 'SIGKILL'
        ))
          .toBe(false)
      } finally {
        kill.mockRestore()
      }
    },
    10_000
  )

  it('falls back to killing the child when Windows taskkill cannot start', async () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

    try {
      const result = await runCommandProcess({
        ...baseOptions,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        timeoutMs: 50
      })

      expect(result.timedOut).toBe(true)
      expect(result.terminationSignal).toMatch(/^SIG/)
      expect(result.executionTimeMs).toBeLessThan(2_000)
    } finally {
      platform.mockRestore()
    }
  })

  it('short-circuits an already-aborted signal before spawning', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await runCommandProcess({
      ...baseOptions,
      executable: '/definitely/missing/executable',
      args: [],
      signal: controller.signal
    })

    expect(result).toMatchObject({
      aborted: true,
      exitCode: null,
      stdoutBytes: 0,
      stderrBytes: 0
    })
  })

  it('returns a typed spawn error for a missing executable', async () => {
    await expect(runCommandProcess({
      ...baseOptions,
      executable: '/definitely/missing/executable',
      args: []
    })).rejects.toMatchObject({
      name: 'CommandProcessSpawnError',
      code: 'ENOENT'
    } satisfies Partial<CommandProcessSpawnError>)
  })
})
