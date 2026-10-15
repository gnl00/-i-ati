export const buildSkillsSystemPrompt = (skillsContext: string): string => {
  const normalizedContext = skillsContext.trim()
  if (!normalizedContext) {
    return ''
  }

  return [
    '<skills_system>',
    '- Skills are optional. Choose relevant capabilities from the catalog or `<loaded_skills_context>` (active names and paths only).',
    '- If needed instructions are absent, call `load_skill`, even if already active. It returns `SKILL.md` and skill_root. Reuse existing instructions; recover incomplete results before use.',
    '- Use `read_skill_file` for additional files or directory listings (`path: "."`). Follow the skill instructions and reuse its resources.',
    '- For bundled scripts, use `run_skill_script`: name, relative script, command with an explicit interpreter and SKILL_SCRIPT. Defaults to the task workspace; use cwd for another directory.',
    '- Ground skill claims in returned content and preserve safety and execution quality.',
    '',
    normalizedContext,
    '</skills_system>'
  ].join('\n')
}
