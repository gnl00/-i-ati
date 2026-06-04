import { describe, expect, it } from 'vitest'
import {
  parseFrontmatter,
  parseSkillMetadata,
  resolveSkillNameForDirectory
} from '../SkillParser'

describe('SkillParser', () => {
  it('parses frontmatter and normalizes metadata', () => {
    const content = [
      '---',
      'name: PDF Processing',
      'description: Handles PDFs.',
      'allowed-tools: read_file write_file',
      'metadata:',
      '  owner: docs',
      '---',
      '',
      '# PDF'
    ].join('\n')

    const parsed = parseFrontmatter(content)
    expect(parsed.frontmatter.name).toBe('PDF Processing')
    expect(parsed.frontmatter.description).toBe('Handles PDFs.')
    expect(parsed.frontmatter.allowedTools).toEqual(['read_file', 'write_file'])
    expect(parsed.frontmatter.metadata).toEqual({ owner: 'docs' })
    expect(parsed.body).toContain('# PDF')

    const metadata = parseSkillMetadata(content)
    expect(metadata.rawName).toBe('PDF Processing')
    expect(metadata.normalizedName).toBe('pdf-processing')
    expect(metadata.metadata.name).toBe('pdf-processing')
    expect(metadata.metadata.frontmatterName).toBe('PDF Processing')
  })

  it('parses folded block descriptions', () => {
    const content = [
      '---',
      'name: caveman',
      'description: >',
      '  Ultra-compressed communication mode. Cuts token usage ~75% by dropping',
      '  filler, articles, and pleasantries while keeping full technical accuracy.',
      '  Use when user says "caveman mode", "talk like caveman", "use caveman",',
      '  "less tokens", "be brief", or invokes /caveman.',
      '---',
      '',
      '# Caveman'
    ].join('\n')

    const parsed = parseFrontmatter(content)
    expect(parsed.frontmatter.description).toBe(
      'Ultra-compressed communication mode. Cuts token usage ~75% by dropping filler, articles, and pleasantries while keeping full technical accuracy. Use when user says "caveman mode", "talk like caveman", "use caveman", "less tokens", "be brief", or invokes /caveman.'
    )
  })

  it('parses literal block descriptions', () => {
    const content = [
      '---',
      'name: literal-skill',
      'description: |',
      '  First line.',
      '  Second line.',
      '---',
      '',
      '# Literal'
    ].join('\n')

    const parsed = parseFrontmatter(content)
    expect(parsed.frontmatter.description).toBe('First line.\nSecond line.')
  })

  it('parses allowed-tools arrays and metadata scalars', () => {
    const content = [
      '---',
      'name: Tool Skill',
      'description: Handles tools.',
      'allowed-tools:',
      '  - read_file',
      '  - write_file',
      'metadata:',
      '  owner: docs',
      '  priority: 1',
      '  enabled: true',
      '---',
      '',
      '# Tools'
    ].join('\n')

    const parsed = parseFrontmatter(content)
    expect(parsed.frontmatter.allowedTools).toEqual(['read_file', 'write_file'])
    expect(parsed.frontmatter.metadata).toEqual({
      owner: 'docs',
      priority: '1',
      enabled: 'true'
    })
  })

  it('rejects skill documents without required frontmatter', () => {
    expect(() => parseFrontmatter('# Missing frontmatter')).toThrow(
      'SKILL.md must start with YAML frontmatter'
    )
  })

  it('keeps already normalized directory names stable', () => {
    expect(resolveSkillNameForDirectory('pdf-processing')).toBe('pdf-processing')
  })
})
