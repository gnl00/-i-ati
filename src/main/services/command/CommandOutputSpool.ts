import { randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readdirSync, statSync, writeSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'
import { canonicalizeThroughExistingPrefix, isPathWithin } from '@main/services/filesystem/WorkspacePathBoundary'

export type CommandOutputArtifact = { path?: string; bytes: number; complete: boolean; error?: string }
export type CommandOutputArtifacts = Record<'stdout' | 'stderr', CommandOutputArtifact>
const workspaceUsage = new Map<string, { bytes: number }>()
export const COMMAND_LOG_LIMIT_BYTES = 64 * 1024 * 1024
export const COMMAND_WORKSPACE_LOG_LIMIT_BYTES = 512 * 1024 * 1024

type Capture = { fd?: number; path?: string; bytes: number; total: number; error?: string }

/** Bounded raw-byte capture. Previews and UI streaming keep their existing budgets. */
export class CommandOutputSpool {
  private readonly captures: Record<'stdout' | 'stderr', Capture> = {
    stdout: { bytes: 0, total: 0 }, stderr: { bytes: 0, total: 0 }
  }
  private usage = { bytes: 0 }

  constructor(
    workspaceRoot: string,
    private readonly streamLimit = COMMAND_LOG_LIMIT_BYTES,
    private readonly workspaceLimit = COMMAND_WORKSPACE_LOG_LIMIT_BYTES
  ) {
    try {
      const root = canonicalizeThroughExistingPrefix(resolve(workspaceRoot))
      const parent = join(root, '.ati/artifacts/commands')
      if (!isPathWithin(canonicalizeThroughExistingPrefix(parent), root)) throw new Error('Command output path escapes the workspace.')
      mkdirSync(parent, { recursive: true })
      if (!isPathWithin(canonicalizeThroughExistingPrefix(parent), root)) throw new Error('Command output path escapes the workspace.')
      const usage = workspaceUsage.get(parent) ?? { bytes: 0 }
      // ponytail: scan managed logs at admission; index only if measured directory traversal becomes costly.
      usage.bytes = readdirSync(parent, { withFileTypes: true }).filter(item => item.isDirectory()).reduce((sum, item) => {
        return sum + readdirSync(join(parent, item.name), { withFileTypes: true })
          .filter(file => file.isFile()).reduce((bytes, file) => bytes + statSync(join(parent, item.name, file.name)).size, 0)
      }, 0)
      workspaceUsage.set(parent, usage)
      this.usage = usage
      const relative = posix.join('.ati/artifacts/commands', randomUUID())
      const directory = join(root, relative)
      mkdirSync(directory, { mode: 0o700 })
      for (const stream of ['stdout', 'stderr'] as const) {
        const path = posix.join(relative, `${stream}.log`)
        this.captures[stream].fd = openSync(join(root, path), 'wx', 0o600)
        this.captures[stream].path = path
      }
    } catch (error) {
      for (const entry of Object.values(this.captures)) entry.error = String(error)
    }
  }

  append(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    const entry = this.captures[stream]
    entry.total += chunk.length
    if (entry.fd === undefined || entry.error) return
    const length = Math.max(0, Math.min(chunk.length, this.streamLimit - entry.bytes, this.workspaceLimit - this.usage.bytes))
    try {
      let written = 0
      while (written < length) {
        const count = writeSync(entry.fd, chunk, written, length - written)
        if (count === 0) throw new Error('Command log write made no progress.')
        written += count
        entry.bytes += count
        this.usage.bytes += count
      }
      if (length < chunk.length) entry.error = 'Command output storage limit reached; later bytes were not saved.'
    } catch (error) {
      entry.error = String(error)
    }
  }

  finish(): CommandOutputArtifacts {
    for (const entry of Object.values(this.captures)) {
      if (entry.fd !== undefined) {
        try { closeSync(entry.fd) } catch (error) { entry.error = String(error) }
        entry.fd = undefined
      }
    }
    return Object.fromEntries(Object.entries(this.captures).map(([stream, entry]) => [stream, {
      path: entry.path, bytes: entry.bytes, complete: !entry.error && entry.bytes === entry.total, error: entry.error
    }])) as CommandOutputArtifacts
  }
}
