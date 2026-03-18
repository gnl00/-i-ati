export const buildUserInstructionPrompt = (prompt?: string): string => {
  const trimmedPrompt = prompt?.trim()
  if (!trimmedPrompt) {
    return ''
  }

  return [
    '<user_instruction>',
    '## [P0] User Instructions',
    trimmedPrompt,
    '</user_instruction>'
  ].join('\n')
}
