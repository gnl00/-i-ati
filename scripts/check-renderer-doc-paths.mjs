import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkActiveRendererDocPaths } from './lib/renderer-architecture-checks.mjs'

const defaultRepoRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = resolve(process.argv[2] ?? defaultRepoRoot)
const docsRoot = process.argv[3] ? resolve(process.argv[3]) : undefined
const violations = await checkActiveRendererDocPaths({ repoRoot, docsRoot })

if (violations.length > 0) {
  console.error('Active documentation references missing renderer source paths:')
  for (const violation of violations) {
    console.error(`- ${relative(repoRoot, violation.file)}:${violation.line}: ${violation.path}`)
  }
  process.exitCode = 1
} else {
  console.log('Active renderer documentation paths passed')
}
