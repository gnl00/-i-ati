import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkMainBoundaries } from './lib/main-architecture-checks.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const mainRoot = resolve(process.argv[2] ?? `${repoRoot}/src/main`)
const violations = await checkMainBoundaries({ mainRoot })

if (violations.length > 0) {
  console.error('Main-process architecture boundary violations:')
  for (const violation of violations) {
    console.error(`- ${relative(repoRoot, violation.file)}:${violation.line}:${violation.column} imports ${violation.specifier} (${violation.rule})`)
  }
  process.exitCode = 1
} else {
  console.log(`Main-process architecture boundaries passed (${relative(repoRoot, mainRoot)})`)
}
