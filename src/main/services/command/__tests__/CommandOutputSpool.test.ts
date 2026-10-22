import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { CommandOutputSpool } from '../CommandOutputSpool'
import { COMMAND_OUTPUT_LIMIT_BYTES, runCommandProcess } from '../CommandProcessRunner'

const roots: string[] = []
const root = (): string => { const path = mkdtempSync(join(tmpdir(), 'ati-command-spool-')); roots.push(path); return path }
afterEach(() => roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))

it('recovers bytes discarded from the in-memory command preview', async () => {
  const workspace = root()
  const marker = 'MIDDLE-EVIDENCE-中文'
  const output = 'a'.repeat(COMMAND_OUTPUT_LIMIT_BYTES) + marker + 'z'.repeat(COMMAND_OUTPUT_LIMIT_BYTES)
  const result = await runCommandProcess({ executable: process.execPath, args: ['-e', `process.stdout.write('a'.repeat(${COMMAND_OUTPUT_LIMIT_BYTES}) + ${JSON.stringify(marker)} + 'z'.repeat(${COMMAND_OUTPUT_LIMIT_BYTES}))`], cwd: workspace, outputRoot: workspace, env: process.env, timeoutMs: 5000 })
  expect(result.stdoutTruncated).toBe(true)
  expect(result.stdout).not.toContain(marker)
  expect(result.outputArtifacts?.stdout.complete).toBe(true)
  expect(readFileSync(join(workspace, result.outputArtifacts!.stdout.path!), 'utf8')).toBe(output)
})

it('bounds each stream and shared workspace usage without deleting existing logs', () => {
  const workspace = root()
  const first = new CommandOutputSpool(workspace, 8, 12)
  first.append('stdout', Buffer.from('12345'))
  const second = new CommandOutputSpool(workspace, 8, 12)
  second.append('stderr', Buffer.from('abcdefghijk'))
  first.append('stdout', Buffer.from('6789'))
  const a = first.finish()
  const b = second.finish()
  expect(a.stdout.bytes + b.stderr.bytes).toBe(12)
  expect(a.stdout.complete).toBe(false)
  expect(b.stderr.complete).toBe(false)
  expect(b.stderr.error).toContain('limit')
  expect(readFileSync(join(workspace, a.stdout.path!), 'utf8')).toBe('12345')
})

it.skipIf(process.platform === 'win32')('reports a storage failure when the artifact path escapes through a symlink', () => {
  const workspace = root()
  const outside = root()
  symlinkSync(outside, join(workspace, '.ati'))
  const spool = new CommandOutputSpool(workspace)
  spool.append('stdout', Buffer.from('evidence'))
  expect(spool.finish().stdout).toMatchObject({ complete: false, bytes: 0, error: expect.stringContaining('escapes') })
})
