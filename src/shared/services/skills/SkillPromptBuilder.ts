export const buildSkillsPrompt = (
  availableSkills: SkillMetadata[],
  _loadedSkills: Array<{ name: string; content: string }> = []
): string => {
  if (availableSkills.length === 0) {
    return ''
  }

  const lines: string[] = ['<skills_context>', '## Skills']

  if (availableSkills.length > 0) {
    lines.push('', '### Available Skills')
    for (const skill of availableSkills) {
      const allowedTools = skill.allowedTools && skill.allowedTools.length > 0
        ? ` (allowed-tools: ${skill.allowedTools.join(' ')})`
        : ''
      lines.push(`- ${skill.name}: ${skill.description}${allowedTools}`)
    }
  }

  lines.push('</skills_context>')

  return `\n\n${lines.join('\n')}`
}
