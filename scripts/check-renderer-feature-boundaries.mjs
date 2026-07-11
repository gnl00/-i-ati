import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRendererBoundaries } from './lib/renderer-architecture-checks.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const rendererRoot = resolve(process.argv[2] ?? `${repoRoot}/src/renderer/src`)
const violations = await checkRendererBoundaries({ rendererRoot })

if (violations.length > 0) {
  console.error('Renderer architecture boundary violations:')
  for (const violation of violations) {
    console.error(
      `- ${relative(repoRoot, violation.file)}:${violation.line}:${violation.column}`
      + ` imports ${violation.specifier} (${violation.rule})`
    )
  }
  process.exitCode = 1
} else {
  console.log(`Renderer architecture boundaries passed (${relative(repoRoot, rendererRoot)})`)
}
