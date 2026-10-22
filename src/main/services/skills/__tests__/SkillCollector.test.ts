import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import path from 'path'
import os from 'os'
import * as fs from 'fs/promises'
import { scanSkillSources } from '../SkillCollector'

let root: string
let embedded: string
const skill = async (
  directory: string,
  name: string,
  description = name
): Promise<string> => {
  await fs.mkdir(directory, { recursive: true })
  const file = path.join(directory, 'SKILL.md')
  await fs.writeFile(
    file,
    `---\nname: ${name}\ndescription: ${description}\n---\nOriginal instructions.\n`
  )
  return file
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-sources-'))
  embedded = path.join(root, 'embedded')
  await fs.mkdir(embedded)
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('source skill discovery', () => {
  it('reads nested sources in place with source order overriding embedded names', async () => {
    const first = path.join(root, 'first')
    const second = path.join(root, 'second')
    const winner = await skill(
      path.join(first, 'nested', 'directory-alias'),
      'pdf',
      'First source'
    )
    const other = await skill(path.join(second, 'pdf'), 'pdf', 'Second source')
    await skill(path.join(embedded, 'pdf'), 'pdf', 'Embedded')
    await skill(path.join(embedded, 'fallback'), 'fallback')
    const before = await fs.readFile(winner, 'utf8')
    const awaitOther = await fs.realpath(other)
    const result = await scanSkillSources([first, second, first], embedded)
    expect(result.skills.map(item => item.name)).toEqual(['fallback', 'pdf'])
    expect(result.skills[1]).toMatchObject({
      description: 'First source',
      source: first,
      path: await fs.realpath(winner)
    })
    expect(result.issues.filter(item => item.kind === 'shadowed')).toHaveLength(
      2
    )
    expect(result.issues.some(item => item.path === awaitOther)).toBe(true)
    expect(await fs.readFile(winner, 'utf8')).toBe(before)
    expect((await fs.readdir(root)).sort()).toEqual([
      'embedded',
      'first',
      'second'
    ])
  })

  it('deduplicates overlapping roots by real path and preserves healthy siblings', async () => {
    const source = path.join(root, 'source')
    const directory = path.join(source, 'pdf')
    await skill(directory, 'pdf')
    await fs.mkdir(path.join(source, 'invalid'))
    await fs.writeFile(path.join(source, 'invalid', 'SKILL.md'), 'invalid')
    const result = await scanSkillSources(
      [path.join(root, 'missing'), source, directory],
      embedded
    )
    expect(result.skills.map(item => item.name)).toEqual(['pdf'])
    expect(result.issues.map(item => item.kind)).toEqual([
      'unavailable',
      'invalid'
    ])
  })

  it('limits traversal and excludes dependency/version-control directories', async () => {
    await skill(path.join(root, 'source', '.git', 'hidden'), 'hidden')
    await skill(
      path.join(root, 'source', 'node_modules', 'dependency'),
      'dependency'
    )
    await skill(path.join(root, 'source', ...Array(6).fill('deep')), 'too-deep')
    const result = await scanSkillSources([path.join(root, 'source')], embedded)
    expect(result.skills).toEqual([])
  })

  it.skipIf(process.platform === 'win32')(
    'accepts an explicitly configured symlink root and rejects escaping skill files',
    async () => {
      const source = path.join(root, 'source')
      await skill(path.join(source, 'good'), 'good')
      const outside = await skill(path.join(root, 'outside'), 'outside')
      await fs.mkdir(path.join(source, 'escape'))
      await fs.symlink(outside, path.join(source, 'escape', 'SKILL.md'))
      const alias = path.join(root, 'alias')
      await fs.symlink(source, alias)
      const result = await scanSkillSources([alias, source], embedded)
      expect(result.skills.map(item => item.name)).toEqual(['good'])
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].message).toContain('escapes skill directory')
    }
  )
})
