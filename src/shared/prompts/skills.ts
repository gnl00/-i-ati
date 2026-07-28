export const buildSkillsSystemPrompt = (skillsContext: string): string => {
  const normalizedContext = skillsContext.trim()
  if (!normalizedContext) {
    return ''
  }

  return [
    '<skills_system>',
    '- Discover relevant capabilities in the available-skills catalog. Call `load_skill` when the task clearly matches.',
    '- `load_skill` activates the skill for the current chat and the runtime injects active skill names through hidden `<loaded_skills_context>` messages.',
    '- When `<loaded_skills_context>` is present, read the full `SKILL.md` through `read_skill_file` before applying a loaded skill.',
    '- Use `read_skill_file` with `path: "."` or a relative directory path to discover skill files and resources.',
    '- When a skill file has been read, follow it and reuse its resources. For a referenced script, run it with `run_skill_script`; execution uses the skill root.',
    '- Apply skills within truthfulness, safety, and execution-quality boundaries. Ground skill claims in content returned by skill tools.',
    '',
    normalizedContext,
    '</skills_system>'
  ].join('\n')
}
