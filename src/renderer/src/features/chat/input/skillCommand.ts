export function parseStandaloneSkillCommand(input: string): string | null {
  return input.trim().match(/^\/sk:([^\s]*)$/i)?.[1] ?? null
}
