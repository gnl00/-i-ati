export type SkillFrontmatter = {
  name: string
  description: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string[]
}

export type ParsedSkill = {
  frontmatter: SkillFrontmatter
  body: string
}

export type ParsedSkillMetadata = {
  parsed: ParsedSkill
  rawName: string
  normalizedName: string
  metadata: SkillMetadata
}

export const SKILL_FILE = 'SKILL.md'
export const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const parseScalar = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const quote = trimmed[0]
    if ((quote === '"' || quote === '\'') && trimmed[trimmed.length - 1] === quote) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

export const parseFrontmatter = (content: string): ParsedSkill => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md must start with YAML frontmatter')
  }

  const frontmatterRaw = match[1]
  const body = match[2] ?? ''
  const lines = frontmatterRaw.split(/\r?\n/)

  const frontmatter: Partial<SkillFrontmatter> = {}
  const metadata: Record<string, string> = {}
  let inMetadata = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim()) {
      continue
    }

    if (inMetadata) {
      if (/^\s+/.test(line)) {
        const idx = line.indexOf(':')
        if (idx !== -1) {
          const key = line.slice(0, idx).trim()
          const value = parseScalar(line.slice(idx + 1))
          if (key) {
            metadata[key] = value
          }
        }
        continue
      }
      inMetadata = false
    }

    const keyEnd = line.indexOf(':')
    if (keyEnd === -1) {
      continue
    }
    const key = line.slice(0, keyEnd).trim()
    const value = line.slice(keyEnd + 1).trim()

    if (key === 'metadata') {
      inMetadata = true
      continue
    }

    if (key === 'allowed-tools') {
      const parsed = parseScalar(value)
      frontmatter.allowedTools = parsed ? parsed.split(/\s+/).filter(Boolean) : []
      continue
    }

    if (key === 'name') {
      frontmatter.name = parseScalar(value)
      continue
    }

    if (key === 'description') {
      frontmatter.description = parseScalar(value)
      continue
    }

    if (key === 'license') {
      frontmatter.license = parseScalar(value)
      continue
    }

    if (key === 'compatibility') {
      frontmatter.compatibility = parseScalar(value)
      continue
    }
  }

  if (Object.keys(metadata).length > 0) {
    frontmatter.metadata = metadata
  }

  if (!frontmatter.name || !frontmatter.description) {
    throw new Error('SKILL.md frontmatter must include name and description')
  }

  return {
    frontmatter: frontmatter as SkillFrontmatter,
    body
  }
}

export const validateSkillName = (name: string): void => {
  if (!name || name.length > 64 || !SKILL_NAME_REGEX.test(name)) {
    throw new Error(`Invalid skill name: "${name}"`)
  }
}

export const validateSkillDescription = (description: string): void => {
  if (!description || description.length > 1024) {
    throw new Error('Skill description must be 1-1024 characters')
  }
}

export const validateOptionalLength = (
  value: string | undefined,
  max: number,
  field: string
): void => {
  if (value && value.length > max) {
    throw new Error(`${field} must be 1-${max} characters`)
  }
}

export const normalizeSkillName = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const trimToMaxLength = (value: string, max: number): string => {
  if (value.length <= max) return value
  return value.slice(0, max).replace(/-+$/g, '')
}

export const resolveSkillNameForDirectory = (frontmatterName: string): string => {
  const normalized = normalizeSkillName(frontmatterName)
  return normalized || frontmatterName
}

export const buildSkillMetadata = (
  frontmatter: SkillFrontmatter,
  options?: { name?: string; frontmatterName?: string }
): SkillMetadata => ({
  name: options?.name ?? frontmatter.name,
  frontmatterName: options?.frontmatterName ?? frontmatter.name,
  description: frontmatter.description,
  license: frontmatter.license,
  compatibility: frontmatter.compatibility,
  metadata: frontmatter.metadata,
  allowedTools: frontmatter.allowedTools
})

export const parseSkillMetadata = (
  content: string,
  options?: { name?: string; frontmatterName?: string }
): ParsedSkillMetadata => {
  const parsed = parseFrontmatter(content)
  const rawName = parsed.frontmatter.name
  const normalizedName = resolveSkillNameForDirectory(rawName)
  validateSkillName(normalizedName)
  validateSkillDescription(parsed.frontmatter.description)
  validateOptionalLength(parsed.frontmatter.compatibility, 500, 'Skill compatibility')

  return {
    parsed,
    rawName,
    normalizedName,
    metadata: buildSkillMetadata(parsed.frontmatter, {
      name: options?.name ?? normalizedName,
      frontmatterName: options?.frontmatterName ?? rawName
    })
  }
}
