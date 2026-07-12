import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import test from 'node:test'
import {
  checkActiveMainDocPaths,
  checkMainBoundaries
} from '../lib/main-architecture-checks.mjs'

async function writeFixture(root, path, contents = 'export const value = true\n') {
  const file = join(root, path)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, contents)
}

function assertRuleViolations(root, violations, rule, expectedFiles) {
  assert.deepEqual(
    new Set(violations.map((violation) => `${relative(root, violation.file)}:${violation.rule}`)),
    new Set(expectedFiles.map((file) => `${file}:${rule}`))
  )
}

test('accepts the approved main-process dependency seams', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'main-boundaries-allowed-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFixture(root, 'db/DatabaseService.ts')
  await writeFixture(root, 'db/chat.ts', "import DatabaseService from './DatabaseService'\n")
  await writeFixture(root, 'services/subagent.ts', "import type { RunEventSink } from '@main/agent/contracts'\n")
  await writeFixture(root, 'hosts/chat.ts', "import type { RunEventEmitter } from '@main/agent/contracts'\n")
  await writeFixture(root, 'app/MainApplication.ts')
  await writeFixture(root, 'index.ts', "import './app/MainApplication'\n")
  assert.deepEqual(await checkMainBoundaries({ mainRoot: root }), [])
})

test('reports service dependencies on tool processors', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'main-boundaries-service-tools-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFixture(root, 'services/static.ts', "import '@main/tools/workContext/Processor.js'\n")
  await writeFixture(root, 'services/export.ts', "export * from '../tools/workContext/Processor.tsx'\n")
  await writeFixture(root, 'services/dynamic.ts', "void import('@main/tools/workContext/Processor.mjs')\n")
  await writeFixture(root, 'services/equals.ts', "import processor = require('../tools/workContext/Processor.cts')\n")
  await writeFixture(root, 'services/allowed.ts', [
    "import '@main/tools-next/Processor.js'",
    "export * from '../tools-next/Processor.tsx'",
    "void import('@main/tools-next/Processor.mjs')",
    "import processor = require('../tools-next/Processor.cts')"
  ].join('\n'))
  const violations = await checkMainBoundaries({ mainRoot: root })
  assertRuleViolations(root, violations, 'services may not depend on main-process tool processors', [
    'services/static.ts',
    'services/export.ts',
    'services/dynamic.ts',
    'services/equals.ts'
  ])
})

test('reports every service import form that reaches run infrastructure', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'main-boundaries-service-run-infra-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFixture(root, 'services/static.ts', "import '@main/orchestration/chat/run/infrastructure/event-emitter.js'\n")
  await writeFixture(root, 'services/export.ts', "export * from '../orchestration/chat/run/infrastructure/event-emitter.tsx'\n")
  await writeFixture(root, 'services/dynamic.ts', "void import('@main/orchestration/chat/run/infrastructure/event-emitter.mjs')\n")
  await writeFixture(root, 'services/equals.ts', "import emitter = require('../orchestration/chat/run/infrastructure/event-emitter.cts')\n")
  await writeFixture(root, 'services/allowed.ts', [
    "import '@main/orchestration/chat/run/infrastructure-next/event-emitter.js'",
    "export * from '../orchestration/chat/run/infrastructure-next/event-emitter.tsx'",
    "void import('@main/orchestration/chat/run/infrastructure-next/event-emitter.mjs')",
    "import emitter = require('../orchestration/chat/run/infrastructure-next/event-emitter.cts')"
  ].join('\n'))
  const violations = await checkMainBoundaries({ mainRoot: root })
  assertRuleViolations(root, violations, 'services must use stable agent contracts instead of run infrastructure', [
    'services/static.ts',
    'services/export.ts',
    'services/dynamic.ts',
    'services/equals.ts'
  ])
})

test('reports every host import form that reaches run infrastructure', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'main-boundaries-host-run-infra-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFixture(root, 'hosts/static.ts', "import '@main/orchestration/chat/run/infrastructure/event-emitter.js'\n")
  await writeFixture(root, 'hosts/export.ts', "export * from '../orchestration/chat/run/infrastructure/event-emitter.tsx'\n")
  await writeFixture(root, 'hosts/dynamic.ts', "void import('@main/orchestration/chat/run/infrastructure/event-emitter.mjs')\n")
  await writeFixture(root, 'hosts/equals.ts', "import emitter = require('../orchestration/chat/run/infrastructure/event-emitter.cts')\n")
  await writeFixture(root, 'hosts/allowed.ts', [
    "import '@main/orchestration/chat/run/infrastructure-next/event-emitter.js'",
    "export * from '../orchestration/chat/run/infrastructure-next/event-emitter.tsx'",
    "void import('@main/orchestration/chat/run/infrastructure-next/event-emitter.mjs')",
    "import emitter = require('../orchestration/chat/run/infrastructure-next/event-emitter.cts')"
  ].join('\n'))
  const violations = await checkMainBoundaries({ mainRoot: root })
  assertRuleViolations(root, violations, 'hosts must use stable agent contracts instead of run infrastructure', [
    'hosts/static.ts',
    'hosts/export.ts',
    'hosts/dynamic.ts',
    'hosts/equals.ts'
  ])
})

test('reports direct DatabaseService imports outside approved facades', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'main-boundaries-direct-db-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const blocked = [
    ['services/static-alias.ts', "import '@main/db/DatabaseService.js'"],
    ['services/static-relative.ts', "import '../db/DatabaseService.ts'"],
    ['services/export-alias.ts', "export * from '@main/db/DatabaseService.jsx'"],
    ['services/export-relative.ts', "export * from '../db/services/DatabaseService.tsx'"],
    ['services/dynamic-alias.ts', "void import('@main/db/DatabaseService.mjs')"],
    ['services/dynamic-relative.ts', "void import('../db/services/DatabaseService.mts')"],
    ['services/equals-alias.ts', "import db = require('@main/db/DatabaseService.cjs')"],
    ['services/equals-relative.ts', "import db = require('../db/services/DatabaseService.cts')"]
  ]
  for (const [file, source] of blocked) await writeFixture(root, file, `${source}\n`)
  await writeFixture(root, 'services/allowed.ts', [
    "import '@main/db/DatabaseService-next.js'",
    "export * from '../db/services/DatabaseService-next.tsx'",
    "void import('@main/db/DatabaseService-next.mjs')",
    "import db = require('../db/services/DatabaseService-next.cts')"
  ].join('\n'))
  const violations = await checkMainBoundaries({ mainRoot: root })
  assertRuleViolations(root, violations, 'production callers must use a domain database facade', blocked.map(([file]) => file))
})

test('reports root entry dependencies outside the app lifecycle boundary', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'main-boundaries-root-entry-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFixture(root, 'index.ts', [
    "import '@main/main-ipc.js'",
    "export * from './main-ipc.tsx'",
    "void import('@main/main-ipc.mjs')",
    "import ipc = require('./main-ipc.cts')",
    "import '@main/app/MainApplication.js'",
    "export * from './app/protocols.tsx'",
    "void import('@main/app/lifecycle.mjs')",
    "import app = require('./app/startup.cts')"
  ].join('\n'))
  const violations = await checkMainBoundaries({ mainRoot: root })
  assert.equal(violations.length, 4)
  assert.deepEqual(new Set(violations.map(({ rule }) => rule)), new Set([
    'the main entry may depend only on the app lifecycle boundary'
  ]))
  assert.deepEqual(new Set(violations.map(({ specifier }) => specifier)), new Set([
    '@main/main-ipc.js',
    './main-ipc.tsx',
    '@main/main-ipc.mjs',
    './main-ipc.cts'
  ]))
})

test('checks current main source paths and skips archive records', async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'main-doc-paths-'))
  t.after(() => rm(repoRoot, { recursive: true, force: true }))
  await writeFixture(repoRoot, 'src/main/app/MainApplication.ts')
  await writeFixture(repoRoot, 'docs/current.md', '`src/main/app/MainApplication.ts`\n`src/main/old/Missing.ts`\n')
  await writeFixture(repoRoot, 'docs/archive/old.md', '`src/main/old/Missing.ts`\n')
  const violations = await checkActiveMainDocPaths({ repoRoot })
  assert.deepEqual(violations.map(({ line, path }) => ({ line, path })), [
    { line: 2, path: 'src/main/old/Missing.ts' }
  ])
})
