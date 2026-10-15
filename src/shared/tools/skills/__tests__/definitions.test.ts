import { describe, expect, it } from 'vitest'
import { skillTools } from '../definitions'

const getToolDescription = (name: string): string => {
  const tool = skillTools.find(item => item.function.name === name)
  return tool?.function.description ?? ''
}

describe('skill tool definitions', () => {
  it('returns skill instructions without requiring a second file read', () => {
    const description = getToolDescription('load_skill')

    expect(description).toContain('return its SKILL.md instructions and skill_root')
    expect(description).toContain('when already active')
    expect(description).toContain('without rereading SKILL.md')
  })

  it('describes read_skill_file as supporting directory listing', () => {
    const description = getToolDescription('read_skill_file')
    const tool = skillTools.find(item => item.function.name === 'read_skill_file')

    expect(description).toContain('Read a file or list a directory')
    expect(tool?.function.parameters.properties.max_entries).toEqual(expect.objectContaining({
      type: 'integer',
      maximum: 500
    }))
  })

  it('defines run_skill_script for skill-bundled scripts', () => {
    const description = getToolDescription('run_skill_script')
    const tool = skillTools.find(item => item.function.name === 'run_skill_script')

    expect(description).toContain('current task workspace')
    expect(description).toContain('SKILL_ROOT and SKILL_SCRIPT')
    expect(tool?.function.parameters.required).toEqual(['name', 'script', 'command'])
    expect(tool?.function.parameters.properties.command).toEqual(expect.objectContaining({
      type: 'string'
    }))
    expect(tool?.function.parameters.properties.cwd?.type).toBe('string')
    expect(tool?.function.parameters.properties).not.toHaveProperty('args')
  })
})
