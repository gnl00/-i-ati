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

  it('rejects skill documents without required frontmatter', () => {
    expect(() => parseFrontmatter('# Missing frontmatter')).toThrow(
      'SKILL.md must start with YAML frontmatter'
    )
  })

  it('keeps already normalized directory names stable', () => {
    expect(resolveSkillNameForDirectory('pdf-processing')).toBe('pdf-processing')
  })
})
