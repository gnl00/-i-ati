import { describe, expect, it } from 'vitest'
import { resolveAllowedEmbeddedToolsForAgent } from '../permissions'

describe('resolveAllowedEmbeddedToolsForAgent', () => {
  it('returns unrestricted access for main agents', () => {
    expect(resolveAllowedEmbeddedToolsForAgent({ kind: 'main' })).toBeUndefined()
  })

  it('allows coder subagents to use write and edit tools', () => {
    const allowed = resolveAllowedEmbeddedToolsForAgent({ kind: 'subagent', role: 'coder' }) || []

    expect(allowed).toContain('read')
    expect(allowed).toContain('write')
    expect(allowed).toContain('edit')
    expect(allowed).toContain('exec')
    expect(allowed).not.toContain('plan')
    expect(allowed).not.toContain('schedule')
  })

  it('keeps reviewer subagents read-only', () => {
    const allowed = resolveAllowedEmbeddedToolsForAgent({ kind: 'subagent', role: 'reviewer' }) || []

    expect(allowed).toContain('read')
    expect(allowed).toContain('grep')
    expect(allowed).not.toContain('write')
    expect(allowed).not.toContain('edit')
  })
})
