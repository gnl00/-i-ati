export const buildSystemPrompt = (prompt: string) => {
  return {
    role: 'system',
    content: prompt
  }
}