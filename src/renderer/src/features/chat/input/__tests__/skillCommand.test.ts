import { describe, expect, it } from 'vitest'
import { parseStandaloneSkillCommand } from '../skillCommand'

describe('standalone skill commands', () => {
  it.each([
    ['/sk:pdf', 'pdf'],
    ['/SK:pdf', 'pdf'],
    ['/SK:PDF', 'PDF'],
    ['  /sk:project-context\n', 'project-context'],
    ['/sk:', ''],
    ['/sk:../pdf', '../pdf']
  ])('recognizes %s for activation validation', (input, name) => {
    expect(parseStandaloneSkillCommand(input)).toBe(name)
  })

  it.each([
    'Use /sk:pdf',
    '/sk:pdf process this file',
    '/sk:pdf\nprocess this file',
    '/sk:pdf\tprocess this file',
    '`/sk:pdf`',
    '/clear',
    ''
  ])('preserves ordinary message content: %s', input => {
    expect(parseStandaloneSkillCommand(input)).toBeNull()
  })
})
