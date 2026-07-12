import { readFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import {
  collectFiles,
  extractStaticModuleReferences
} from './renderer-architecture-checks.mjs'

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const resolvableModuleExtensionPattern = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u

function normalize(path) {
  return path.split(sep).join('/')
}

function normalizeResolvedModulePath(path) {
  return normalize(path).replace(resolvableModuleExtensionPattern, '')
}

function isWithinBoundary(target, boundary) {
  return target === boundary || target.startsWith(`${boundary}/`)
}

function resolveMainReference(mainRoot, sourceFile, specifier) {
  if (specifier.startsWith('@main/')) {
    return normalizeResolvedModulePath(resolve(mainRoot, specifier.slice('@main/'.length)))
  }
  if (specifier.startsWith('.')) {
    return normalizeResolvedModulePath(resolve(sourceFile, '..', specifier))
  }
  return undefined
}

function isTestFile(path) {
  return path.includes('/__tests__/') || /\.test\.[cm]?[jt]sx?$/.test(path)
}

export async function checkMainBoundaries({ mainRoot }) {
  const files = await collectFiles(mainRoot, (path) => sourceExtensions.has(extname(path)))
  const normalizedRoot = normalize(mainRoot)
  const violations = []

  for (const file of files) {
    const normalizedFile = normalize(file)
    if (isTestFile(normalizedFile)) continue
    const source = await readFile(file, 'utf8')

    for (const reference of extractStaticModuleReferences(source, file)) {
      const target = resolveMainReference(mainRoot, file, reference.specifier)
      if (!target) continue
      let rule

      if (normalizedFile.startsWith(`${normalizedRoot}/services/`)
        && isWithinBoundary(target, `${normalizedRoot}/tools`)) {
        rule = 'services may not depend on main-process tool processors'
      } else if (normalizedFile.startsWith(`${normalizedRoot}/services/`)
        && isWithinBoundary(target, `${normalizedRoot}/orchestration/chat/run/infrastructure`)) {
        rule = 'services must use stable agent contracts instead of run infrastructure'
      } else if (normalizedFile.startsWith(`${normalizedRoot}/hosts/`)
        && isWithinBoundary(target, `${normalizedRoot}/orchestration/chat/run/infrastructure`)) {
        rule = 'hosts must use stable agent contracts instead of run infrastructure'
      } else if (target === `${normalizedRoot}/db/DatabaseService`
        || target === `${normalizedRoot}/db/services/DatabaseService`) {
        const relativeSource = normalize(relative(mainRoot, file))
        if (!/^db\/(?:DatabaseService|assistants|chat|config|planning|plugins|run-events|runtime|smart-messages)\.ts$/.test(relativeSource)) {
          rule = 'production callers must use a domain database facade'
        }
      } else if (normalizedFile === `${normalizedRoot}/index.ts`
        && !isWithinBoundary(target, `${normalizedRoot}/app`)) {
        rule = 'the main entry may depend only on the app lifecycle boundary'
      }

      if (rule) {
        violations.push({
          file,
          line: reference.line,
          column: reference.column,
          specifier: reference.specifier,
          rule
        })
      }
    }
  }

  return violations
}

export function extractMainSourcePaths(markdown) {
  return [...markdown.matchAll(/src\/main(?:\/[A-Za-z0-9_.@+$-]+)*/g)].map((match) => ({
    path: match[0].replace(/[.,;!?]+$/u, ''),
    offset: match.index ?? 0
  }))
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split('\n').length
}

export async function checkActiveMainDocPaths({ repoRoot, docsRoot = join(repoRoot, 'docs') }) {
  const markdownFiles = await collectFiles(docsRoot, (path) => path.endsWith('.md'))
  const violations = []

  for (const file of markdownFiles) {
    const relativePath = normalize(relative(docsRoot, file))
    if (relativePath.startsWith('archive/') || relativePath.startsWith('reference/')) continue
    const markdown = await readFile(file, 'utf8')
    if (/^Documentation mode:\s*Historical\s*$/im.test(markdown)) continue

    for (const reference of extractMainSourcePaths(markdown)) {
      const target = join(repoRoot, reference.path)
      try {
        await readFile(target)
      } catch {
        try {
          const files = await collectFiles(target, () => false)
          void files
        } catch {
          violations.push({ file, line: lineForOffset(markdown, reference.offset), path: reference.path })
        }
      }
    }
  }

  return violations
}
