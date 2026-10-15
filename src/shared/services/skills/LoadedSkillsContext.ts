import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { escapeXmlText, xmlSelfClosingTag, xmlTag } from '@shared/utils/xml'

export type LoadedSkillContent = {
  name: string
  path?: string
}

export const buildLoadedSkillsContextContent = (skills: LoadedSkillContent[]): string => {
  const loadedSkills = skills
    .map((skill) => ({
      name: skill.name.trim(),
      path: skill.path?.trim()
    }))
    .filter(skill => skill.name)

  if (loadedSkills.length === 0) {
    return ''
  }

  return xmlTag('loaded_skills_context', [
    '',
    ...loadedSkills.map(buildSkillNode),
    xmlTag(
      'instruction',
      escapeXmlText('Use an active skill only when relevant. If you need its instructions and they are absent from the current context, call load_skill; it returns SKILL.md even when already active. Reuse instructions already present without rereading them.')
    ),
    ''
  ].join('\n'))
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

const buildSkillNode = (skill: LoadedSkillContent): string => {
  const path = skill.path?.trim()
  return xmlSelfClosingTag('skill', {
    name: skill.name.trim(),
    path: path || undefined
  })
}
