import { parse as parseYaml } from 'yaml'

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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const normalizeString = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  throw new Error(`SKILL.md frontmatter field "${field}" must be a string`)
}

const normalizeMetadata = (value: unknown): Record<string, string> | undefined => {
  if (value === undefined || value === null) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new Error('SKILL.md frontmatter field "metadata" must be an object')
  }

  const metadata: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) {
      continue
    }

    metadata[key] = isRecord(item) || Array.isArray(item)
      ? JSON.stringify(item)
      : String(item)
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

const normalizeAllowedTools = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value === 'string') {
    return value.split(/\s+/).filter(Boolean)
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      const tool = normalizeString(item, 'allowed-tools')
      return tool ?? ''
    }).filter(Boolean)
  }

  throw new Error('SKILL.md frontmatter field "allowed-tools" must be a string or string array')
}

const normalizeFrontmatter = (value: unknown): SkillFrontmatter => {
  if (!isRecord(value)) {
    throw new Error('SKILL.md frontmatter must be a YAML object')
  }

  const frontmatter: Partial<SkillFrontmatter> = {
    name: normalizeString(value.name, 'name'),
    description: normalizeString(value.description, 'description'),
    license: normalizeString(value.license, 'license'),
    compatibility: normalizeString(value.compatibility, 'compatibility'),
    metadata: normalizeMetadata(value.metadata),
    allowedTools: normalizeAllowedTools(value['allowed-tools'])
  }

  if (!frontmatter.name || !frontmatter.description) {
    throw new Error('SKILL.md frontmatter must include name and description')
  }

  return frontmatter as SkillFrontmatter
}

export const parseFrontmatter = (content: string): ParsedSkill => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md must start with YAML frontmatter')
  }

  const frontmatterRaw = match[1]
  const body = match[2] ?? ''
  const frontmatter = normalizeFrontmatter(parseYaml(frontmatterRaw))

  return {
    frontmatter,
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
