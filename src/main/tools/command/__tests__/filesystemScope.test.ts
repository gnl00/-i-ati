import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { assessCommandFilesystemScope } from '../filesystemScope'

describe('command filesystem scope helpers', () => {
  const temporaryDirectories: string[] = []

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps declared workspace commands inside the workspace', () => {
    const result = assessCommandFilesystemScope({
      command: 'cat ./package.json',
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Reads a file under the workspace root.'
    })

    expect(result.requiresConfirmation).toBe(false)
    expect(result.declaredScope).toBe('workspace')
    expect(result.inferredScope).toBe('workspace')
  })

  it('requires confirmation for home directory references even when declared workspace', () => {
    const result = assessCommandFilesystemScope({
      command: 'cat ~/.zshrc',
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Model thought this was a normal read.'
    })

    expect(result.requiresConfirmation).toBe(true)
    expect(result.declaredScope).toBe('workspace')
    expect(result.inferredScope).toBe('outside_workspace')
    expect(result.reason).toContain('home directory')
  })

  it('requires confirmation when the declaration is missing', () => {
    const result = assessCommandFilesystemScope({
      command: 'pwd'
    })

    expect(result.requiresConfirmation).toBe(true)
    expect(result.declaredScope).toBe('unknown')
    expect(result.inferredScope).toBe('workspace')
  })

  it('keeps a canonical workspace subdirectory in the workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'ati-command-scope-'))
    temporaryDirectories.push(root)
    mkdirSync(join(root, 'packages', 'app'), { recursive: true })

    const result = assessCommandFilesystemScope({
      command: 'pwd',
      cwd: 'packages/app',
      workspaceRoot: root,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Reads the selected workspace package.'
    })

    expect(result.requiresConfirmation).toBe(false)
    expect(result.cwdScope).toBe('workspace')
  })

  it.each(['/etc', '../../etc'])(
    'requires confirmation when cwd escapes the workspace: %s',
    (cwd) => {
      const root = mkdtempSync(join(tmpdir(), 'ati-command-scope-'))
      temporaryDirectories.push(root)

      const result = assessCommandFilesystemScope({
        command: 'pwd',
        cwd,
        workspaceRoot: root,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'Reads the selected directory.'
      })

      expect(result.requiresConfirmation).toBe(true)
      expect(result.cwdScope).toBe('outside_workspace')
      expect(result.reason).toContain(cwd)
    }
  )

  it('requires confirmation when cwd follows a symlink outside the workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'ati-command-scope-'))
    const outside = mkdtempSync(join(tmpdir(), 'ati-command-outside-'))
    temporaryDirectories.push(root, outside)
    symlinkSync(outside, join(root, 'external'))

    const result = assessCommandFilesystemScope({
      command: 'pwd',
      cwd: 'external',
      workspaceRoot: root,
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Reads a workspace path.'
    })

    expect(result.requiresConfirmation).toBe(true)
    expect(result.cwdScope).toBe('outside_workspace')
    expect(result.reason).toContain('external')
  })

  it('requires confirmation for executable and runtime loading environment overrides', () => {
    const result = assessCommandFilesystemScope({
      command: 'node ./script.js',
      env: {
        BASH_ENV: './bootstrap.sh',
        ENV: './shell-init.sh',
        NODE_OPTIONS: '--require ./bootstrap.js',
        PATH: '/custom/bin',
        SAFE_VALUE: 'kept'
      },
      workspaceRoot: '/workspace',
      filesystem_scope: 'workspace',
      filesystem_scope_reason: 'Runs a workspace script.'
    })

    expect(result.requiresConfirmation).toBe(true)
    expect(result.inferredScope).toBe('unknown')
    expect(result.sensitiveEnvironmentVariables).toEqual(['BASH_ENV', 'ENV', 'NODE_OPTIONS', 'PATH'])
    expect(result.reason).toContain('BASH_ENV, ENV, NODE_OPTIONS, PATH')
  })
})
