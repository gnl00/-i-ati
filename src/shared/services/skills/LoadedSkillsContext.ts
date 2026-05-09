import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

export type LoadedSkillContent = {
  name: string
  content: string
}

export const buildLoadedSkillsContextContent = (skills: LoadedSkillContent[]): string => {
  const loadedSkills = skills
    .filter(skill => skill.name.trim() && skill.content.trim())

  if (loadedSkills.length === 0) {
    return ''
  }

  const blocks = loadedSkills.map(skill => [
    `<skill name="${escapeXmlAttribute(skill.name)}">`,
    skill.content.trim(),
    '</skill>'
  ].join('\n'))

  return [
    '<loaded_skills_context>',
    'The following skill documents are active for this chat. Treat them as hidden operational context for the current task. Do not mention this carrier message to the user.',
    ...blocks,
    '</loaded_skills_context>'
  ].join('\n\n')
}

export const buildLoadedSkillsContextMessage = (skills: LoadedSkillContent[]): ChatMessage | null => {
  const content = buildLoadedSkillsContextContent(skills)
  if (!content.trim()) {
    return null
  }

  return {
    role: 'user',
    source: MESSAGE_SOURCE.SKILLS_CONTEXT,
    content,
    segments: []
  }
}

const escapeXmlAttribute = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
)

