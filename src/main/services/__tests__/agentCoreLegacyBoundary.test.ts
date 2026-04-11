import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SERVICES_ROOT = path.resolve(__dirname, '..')
const LEGACY_ROOT = path.join(SERVICES_ROOT, 'agentCore')
const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx'])
const AGENT_CORE_IMPORT_PATTERN = /from\s+['"]@main\/services\/agentCore(?:\/[^'"]*)?['"]|import\s*\(\s*['"]@main\/services\/agentCore(?:\/[^'"]*)?['"]\s*\)/

const collectSourceFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (fullPath === LEGACY_ROOT) {
        continue
      }
      files.push(...collectSourceFiles(fullPath))
      continue
    }

    if (!SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      continue
    }

    files.push(fullPath)
  }

  return files
}

describe('agentCore legacy boundary', () => {
  it('does not allow non-legacy services to import agentCore', () => {
    const violations = collectSourceFiles(SERVICES_ROOT)
      .map((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8')
        return AGENT_CORE_IMPORT_PATTERN.test(content)
          ? path.relative(SERVICES_ROOT, filePath)
          : null
      })
      .filter((value): value is string => value !== null)

    expect(violations).toEqual([])
  })

  it('does not keep code files under the retired agentCore directory', () => {
    if (!fs.existsSync(LEGACY_ROOT)) {
      expect(fs.existsSync(LEGACY_ROOT)).toBe(false)
      return
    }

    const retainedFiles = collectSourceFiles(LEGACY_ROOT).map(filePath => (
      path.relative(SERVICES_ROOT, filePath)
    ))

    expect(retainedFiles).toEqual([])
  })
})
