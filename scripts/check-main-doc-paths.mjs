import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkActiveMainDocPaths } from './lib/main-architecture-checks.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const violations = await checkActiveMainDocPaths({ repoRoot })

if (violations.length > 0) {
  console.error('Active main-process documentation contains stale source paths:')
  for (const violation of violations) {
    console.error(`- ${relative(repoRoot, violation.file)}:${violation.line} references ${violation.path}`)
  }
  process.exitCode = 1
} else {
  console.log('Active main-process documentation paths passed')
}
