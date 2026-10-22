import path from 'path'
import * as fs from 'fs/promises'
import { SKILL_FILE, parseSkillMetadata } from './SkillParser'
import { resolveSkillPath } from './SkillPathResolver'

/** Configured folders win in order; embedded skills fill remaining names. */
export const scanSkillSources = async (
  folders: string[],
  builtInRoot: string
): Promise<SkillScanResult> => {
  const skills = new Map<string, SkillMetadata>()
  const seenSkills = new Set<string>()
  const seenRoots = new Set<string>()
  const issues: SkillScanIssue[] = []
  const sources = [
    ...folders.map(folder => ({ root: folder, source: folder })),
    { root: builtInRoot, source: 'built-in' }
  ]

  for (const { root, source } of sources) {
    let canonicalRoot: string
    try {
      canonicalRoot = await fs.realpath(root)
      if (!(await fs.stat(canonicalRoot)).isDirectory())
        throw new Error('Not a directory')
    } catch (error) {
      issues.push({ path: root, kind: 'unavailable', message: String(error) })
      continue
    }
    if (seenRoots.has(canonicalRoot)) continue
    seenRoots.add(canonicalRoot)
    const queue = [{ directory: canonicalRoot, depth: 0 }]
    for (let index = 0; index < queue.length; index++) {
      const { directory, depth } = queue[index]
      try {
        const entries = await fs.readdir(directory, { withFileTypes: true })
        const skillFile = entries.find(entry => entry.name === SKILL_FILE)
        if (skillFile) {
          const resolved = await resolveSkillPath(
            directory,
            SKILL_FILE,
            'Skill file'
          )
          if (!(await fs.stat(resolved.canonicalPath)).isFile())
            throw new Error('SKILL.md must be a regular file')
          if (seenSkills.has(resolved.canonicalSkillRoot)) continue
          seenSkills.add(resolved.canonicalSkillRoot)
          const content = await fs.readFile(resolved.canonicalPath, 'utf-8')
          const { metadata } = parseSkillMetadata(content)
          const winner = skills.get(metadata.name)
          if (winner) {
            issues.push({
              path: resolved.canonicalPath,
              kind: 'shadowed',
              message: `${metadata.name} is shadowed by ${winner.path}`
            })
          } else {
            skills.set(metadata.name, {
              ...metadata,
              source,
              path: path.join(resolved.canonicalSkillRoot, SKILL_FILE)
            })
          }
          continue
        }
        if (depth >= 5) continue
        for (const entry of entries.sort((a, b) =>
          a.name.localeCompare(b.name)
        )) {
          if (
            entry.isDirectory() &&
            !['.git', 'node_modules'].includes(entry.name)
          ) {
            queue.push({
              directory: path.join(directory, entry.name),
              depth: depth + 1
            })
          }
        }
      } catch (error) {
        issues.push({
          path: directory,
          kind: 'invalid',
          message: String(error)
        })
      }
    }
  }
  return {
    skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)),
    issues
  }
}
