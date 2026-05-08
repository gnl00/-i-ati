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
    '- After `load_skill` returns a skill document, treat that tool result as active task context and follow it as high-priority operational guidance unless it conflicts with higher-level system or safety rules.',
    '',
    '### Skill Usage Policy',
    '- When the task clearly matches an available skill, proactively load and use it.',
    '- When skill content has been returned by `load_skill`, prefer its workflow, scripts, and referenced resources over improvising a parallel process.',
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
