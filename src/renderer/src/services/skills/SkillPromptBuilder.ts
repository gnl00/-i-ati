type LoadedSkillContent = {
  name: string
  content: string
}

export const buildSkillsPrompt = (
  availableSkills: SkillMetadata[],
  loadedSkills: LoadedSkillContent[]
): string => {
  if (availableSkills.length === 0 && loadedSkills.length === 0) {
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

  if (loadedSkills.length > 0) {
    lines.push('', '### Loaded Skills')
    for (const skill of loadedSkills) {
      lines.push(`<skill name="${skill.name}">`)
      lines.push(skill.content.trim())
      lines.push(`</skill>`)
    }
  }

  lines.push('</skills_context>')

  return `\n\n${lines.join('\n')}`
}
