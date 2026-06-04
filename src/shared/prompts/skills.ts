export const buildSkillsSystemPrompt = (skillsContext: string): string => {
  const normalizedContext = skillsContext.trim()
  if (!normalizedContext) {
    return ''
  }

  return [
    '<skills_system>',
    '## [P1] Skills',
    '',
    '### Skills Role',
    '- Skills are on-demand capability packages containing instructions, workflows, scripts, and domain-specific resources.',
    '- Treat skills as reusable operational context that can extend your default capabilities for the current task.',
    '- Use skills to improve correctness, consistency, and execution efficiency when a task matches a known workflow or domain.',
    '',
    '### Operating Rules',
    '- The skills context starts with **Available Skills** only: names, descriptions, and optional allowed tools.',
    '- Available skills are discoverable options, not active instructions.',
    '- Call `load_skill` when the current task clearly matches an available skill.',
    '- `load_skill` activates the skill for the current chat and the runtime injects the full active skill documents through hidden `<loaded_skills_context>` messages.',
    '- When `<loaded_skills_context>` is present, treat those skill documents as active task context and follow them as high-priority operational guidance unless they conflict with higher-level system or safety rules.',
    '- Use `read_skill_file` with `path: "."` or a relative directory path to inspect files inside an available skill; do not use broad filesystem searches to discover skill files.',
    '- When a loaded skill document references a bundled script path such as `scripts/...`, run it with `run_skill_script` instead of `execute_command` so the runtime uses the skill root.',
    '',
    '### Skill Usage Policy',
    '- When the task clearly matches an available skill, proactively load and use it.',
    '- When active skill content appears in hidden loaded-skill context, prefer its workflow, scripts, and referenced resources over improvising a parallel process.',
    '- Reuse loaded skill instructions faithfully, while still applying independent judgment to detect errors, stale assumptions, or conflicts.',
    '- If multiple loaded skill contents overlap, reconcile them explicitly and choose the minimal coherent workflow.',
    '',
    '### Skill Boundaries',
    '- Skills extend behavior; they do not override core truthfulness, safety, or execution-quality standards.',
    '- Do not hallucinate skill files, scripts, or resource contents that have not been returned by a skill tool.',
    '- If a skill appears incomplete or inconsistent, state the issue briefly and continue with the best grounded fallback.',
    '',
    normalizedContext,
    '</skills_system>'
  ].join('\n')
}
