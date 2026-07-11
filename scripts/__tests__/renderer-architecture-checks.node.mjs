import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  checkActiveRendererDocPaths,
  checkRendererBoundaries,
  extractStaticModuleReferences
} from '../lib/renderer-architecture-checks.mjs'

async function writeFixture(root, path, contents = 'export const value = true\n') {
  const file = join(root, path)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, contents)
}

test('extracts import, export-from, and dynamic import references', () => {
  const references = extractStaticModuleReferences(`
    import value from '@renderer/shared/value'
    export { other } from '../other'
    const lazy = import('./lazy')
  `)
  assert.deepEqual(references.map(({ specifier }) => specifier), [
    '@renderer/shared/value',
    '../other',
    './lazy'
  ])
})

test('accepts the renderer dependency direction and feature public entries', async (t) => {
  const rendererRoot = await mkdtemp(join(tmpdir(), 'renderer-boundaries-allowed-'))
  t.after(() => rm(rendererRoot, { recursive: true, force: true }))

  await writeFixture(rendererRoot, 'shared/value.ts')
  await writeFixture(rendererRoot, 'infrastructure/client.ts', "export { value } from '@renderer/shared/value'\n")
  await writeFixture(rendererRoot, 'features/settings/index.ts')
  await writeFixture(rendererRoot, 'features/chat/local.ts')
  await writeFixture(rendererRoot, 'features/chat/view.ts', `
    import './local'
    export { value } from '@renderer/features/settings'
    const client = import('@renderer/infrastructure/client')
  `)
  await writeFixture(rendererRoot, 'features/chat/index.ts', "export * from './view'\n")
  await writeFixture(rendererRoot, 'app/App.ts', "export * from '@renderer/features/chat'\n")

  assert.deepEqual(await checkRendererBoundaries({ rendererRoot }), [])
})

test('reports alias and relative violations across every renderer layer', async (t) => {
  const rendererRoot = await mkdtemp(join(tmpdir(), 'renderer-boundaries-invalid-'))
  t.after(() => rm(rendererRoot, { recursive: true, force: true }))

  await writeFixture(rendererRoot, 'app/App.ts')
  await writeFixture(rendererRoot, 'features/settings/index.ts')
  await writeFixture(rendererRoot, 'features/settings/internal.ts')
  await writeFixture(rendererRoot, 'features/chat/alias.ts', "import '@renderer/app/App'\n")
  await writeFixture(rendererRoot, 'features/chat/relative.ts', "export { value } from '../settings/internal'\n")
  await writeFixture(rendererRoot, 'app/deep-feature.ts', "export { value } from '../features/settings/internal'\n")
  await writeFixture(rendererRoot, 'shared/alias.ts', "export { value } from '@renderer/features/settings'\n")
  await writeFixture(rendererRoot, 'shared/infrastructure.ts', "export { value } from '@renderer/infrastructure/client'\n")
  await writeFixture(rendererRoot, 'infrastructure/client.ts')
  await writeFixture(rendererRoot, 'infrastructure/relative.ts', "const app = import('../app/App')\n")

  const violations = await checkRendererBoundaries({ rendererRoot })
  assert.deepEqual(violations.map(({ specifier }) => specifier).sort(), [
    '../app/App',
    '../features/settings/internal',
    '../settings/internal',
    '@renderer/app/App',
    '@renderer/features/settings',
    '@renderer/infrastructure/client'
  ])
})

test('keeps dev modules and the renderer root entry outside production dependencies', async (t) => {
  const rendererRoot = await mkdtemp(join(tmpdir(), 'renderer-boundaries-composition-'))
  t.after(() => rm(rendererRoot, { recursive: true, force: true }))

  await writeFixture(rendererRoot, 'dev/experiment.ts')
  await writeFixture(rendererRoot, 'main.tsx', "import '@renderer/app/App'\n")
  await writeFixture(rendererRoot, 'app/App.ts', "import '@renderer/dev/experiment'\n")
  await writeFixture(rendererRoot, 'features/chat/dev-relative.ts', "import '../../dev/experiment'\n")
  await writeFixture(rendererRoot, 'features/chat/root-alias.ts', "import '@renderer/main'\n")
  await writeFixture(rendererRoot, 'shared/root-relative.ts', "import '../main'\n")
  await writeFixture(rendererRoot, 'infrastructure/dev-alias.ts', "import '@renderer/dev/experiment'\n")
  await writeFixture(rendererRoot, 'dev/production-consumer.ts', "import '@renderer/features/chat/dev-relative'\n")

  const violations = await checkRendererBoundaries({ rendererRoot })
  assert.deepEqual(violations.map(({ specifier }) => specifier).sort(), [
    '../../dev/experiment',
    '../main',
    '@renderer/dev/experiment',
    '@renderer/dev/experiment',
    '@renderer/main'
  ])
})

test('checks active docs and excludes archive and reference mirrors', async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'renderer-doc-paths-'))
  t.after(() => rm(repoRoot, { recursive: true, force: true }))

  await writeFixture(repoRoot, 'src/renderer/src/app/App.ts')
  await writeFixture(repoRoot, 'src/renderer/src/infrastructure/config/appConfig.ts')
  await mkdir(join(repoRoot, 'src/renderer/src/features/chat'), { recursive: true })
  await writeFixture(repoRoot, 'src/renderer/src/features/settings/index.ts')
  await writeFixture(repoRoot, 'docs/current.md', [
    '`src/renderer/src/app/App.ts`',
    '[renderer entry](../src/renderer/src/app/App.ts)',
    '`src/renderer/src/features/chat`',
    '`src/renderer/src/features/chat/Missing.tsx`',
    'prose src/renderer/src/features/chat/ProseExample.tsx:42.',
    '```ts',
    'src/renderer/src/features/chat/FencedExample.tsx,',
    '```',
    '`@renderer/infrastructure/config/appConfig` `@renderer/features/chat` `@renderer/app/App.ts` `@renderer/features/settings`',
    '`@renderer/features/chat/MissingInline`',
    '```tsx',
    "import missing from '@renderer/features/chat/MissingFenced'",
    '```',
    'prose @renderer/features/chat/ProseAlias'
  ].join('\n'))
  await writeFixture(repoRoot, 'docs/archive/old.md', '`src/renderer/src/old/Missing.ts`\n')
  await writeFixture(repoRoot, 'docs/reference/vendor.md', '`src/renderer/src/vendor/Missing.ts`\n')
  await writeFixture(repoRoot, 'docs/historical.md', [
    'Documentation mode: Historical',
    '`src/renderer/src/old/Historical.ts`'
  ].join('\n'))

  const violations = await checkActiveRendererDocPaths({ repoRoot })
  assert.deepEqual(violations.map(({ line, path }) => ({ line, path })), [
    { line: 4, path: 'src/renderer/src/features/chat/Missing.tsx' },
    { line: 5, path: 'src/renderer/src/features/chat/ProseExample.tsx' },
    { line: 7, path: 'src/renderer/src/features/chat/FencedExample.tsx' },
    { line: 10, path: '@renderer/features/chat/MissingInline' },
    { line: 12, path: '@renderer/features/chat/MissingFenced' }
  ])
})
