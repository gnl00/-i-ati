import { describe, expect, it } from 'vitest'
import { skillTools } from '../definitions'

const getToolDescription = (name: string): string => {
  const tool = skillTools.find(item => item.function.name === name)
  return tool?.function.description ?? ''
}

describe('skill tool definitions', () => {
  it('describes load_skill as hidden context activation', () => {
    const description = getToolDescription('load_skill')

    expect(description).toContain('hidden loaded skills context')
    expect(description).not.toContain('return its full instruction content')
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

    expect(description).toContain('Run a script bundled inside an available skill')
    expect(tool?.function.parameters.required).toEqual(['name', 'script'])
    expect(tool?.function.parameters.properties.args).toEqual(expect.objectContaining({
      type: 'array'
    }))
  })
})
