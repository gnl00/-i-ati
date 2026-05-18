import { describe, expect, it } from 'vitest'
import { assessCommandFilesystemScope } from '../filesystemScope'

describe('command filesystem scope helpers', () => {
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
})
