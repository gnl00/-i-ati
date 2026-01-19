import { describe, expect, it } from 'vitest'
import { buildSkillsPrompt } from './SkillPromptBuilder'

describe('buildSkillsPrompt', () => {
  it('returns empty string when no skills are provided', () => {
    expect(buildSkillsPrompt([], [])).toBe('')
  })

  it('renders available skills list', () => {
    const prompt = buildSkillsPrompt(
      [{ name: 'pdf-processing', description: 'Handle PDFs.' }],
      []
    )
    expect(prompt).toContain('## Skills')
    expect(prompt).toContain('- pdf-processing: Handle PDFs.')
  })

  it('renders loaded skills content', () => {
    const prompt = buildSkillsPrompt(
      [],
      [{ name: 'data-analysis', content: '---\nname: data-analysis\n---\nDo work.' }]
    )
    expect(prompt).toContain('<skill name="data-analysis">')
    expect(prompt).toContain('Do work.')
    expect(prompt).toContain('</skill>')
  })
})
