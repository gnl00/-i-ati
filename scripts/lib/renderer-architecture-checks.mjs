import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const moduleExtensions = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css']
const productionLayers = new Set(['app', 'features', 'shared', 'infrastructure'])
const domainLayers = new Set(['features', 'shared', 'infrastructure'])

async function fileExists(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function collectFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path, predicate))
    } else if (predicate(path)) {
      files.push(path)
    }
  }

  return files
}

export function extractStaticModuleReferences(source, fileName = 'source.ts') {
  const scriptKind = fileName.endsWith('.tsx') || fileName.endsWith('.jsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind)
  const references = []

  function addReference(node) {
    if (!node || !ts.isStringLiteralLike(node)) return
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    references.push({ specifier: node.text, line: line + 1, column: character + 1 })
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addReference(node.moduleSpecifier)
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)) {
      addReference(node.moduleReference.expression)
    } else if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1) {
      addReference(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return references
}

async function resolveModuleCandidate(basePath) {
  for (const extension of moduleExtensions) {
    const candidate = `${basePath}${extension}`
    if (await fileExists(candidate)) return candidate
  }
  for (const extension of moduleExtensions.slice(1)) {
    const candidate = join(basePath, `index${extension}`)
    if (await fileExists(candidate)) return candidate
  }
  return undefined
}

export async function resolveRendererModule({ rendererRoot, sourceFile, specifier }) {
  let basePath
  if (specifier === '@renderer') {
    basePath = rendererRoot
  } else if (specifier.startsWith('@renderer/')) {
    basePath = resolve(rendererRoot, specifier.slice('@renderer/'.length))
  } else if (specifier.startsWith('.')) {
    basePath = resolve(dirname(sourceFile), specifier)
  } else {
    return undefined
  }

  return resolveModuleCandidate(basePath)
}

function rendererLocation(rendererRoot, file) {
  const parts = relative(rendererRoot, file).split(sep)
  const layer = parts[0]
  return {
    layer,
    feature: layer === 'features' ? parts[1] : undefined,
    parts
  }
}

function isFeaturePublicEntry(rendererRoot, targetFile, targetFeature) {
  const target = rendererLocation(rendererRoot, targetFile)
  return target.layer === 'features'
    && target.feature === targetFeature
    && target.parts.length === 3
    && /^index\.(?:[cm]?[jt]sx?)$/.test(target.parts[2])
}

function isRendererRootEntry(rendererRoot, file) {
  const location = rendererLocation(rendererRoot, file)
  return location.parts.length === 1 && /^main\.(?:[cm]?[jt]sx?)$/.test(location.parts[0])
}

export async function checkRendererBoundaries({ rendererRoot }) {
  const files = await collectFiles(rendererRoot, (path) => sourceExtensions.has(extname(path)))
  const violations = []

  for (const file of files) {
    const sourceLocation = rendererLocation(rendererRoot, file)
    const source = await readFile(file, 'utf8')

    for (const reference of extractStaticModuleReferences(source, file)) {
      const targetFile = await resolveRendererModule({ rendererRoot, sourceFile: file, specifier: reference.specifier })
      if (!targetFile) continue
      const targetLocation = rendererLocation(rendererRoot, targetFile)
      let rule

      if (targetLocation.layer === 'dev'
        && (productionLayers.has(sourceLocation.layer) || isRendererRootEntry(rendererRoot, file))) {
        rule = 'production renderer modules may not depend on dev modules'
      } else if (domainLayers.has(sourceLocation.layer)
        && isRendererRootEntry(rendererRoot, targetFile)) {
        rule = 'features, shared, and infrastructure may not depend on the renderer root composition entry'
      } else if (sourceLocation.layer === 'app'
        && targetLocation.layer === 'features'
        && !isFeaturePublicEntry(rendererRoot, targetFile, targetLocation.feature)) {
        rule = `app imports must use features/${targetLocation.feature}/index`
      } else if (sourceLocation.layer === 'shared'
        && ['app', 'features', 'infrastructure'].includes(targetLocation.layer)) {
        rule = 'shared may depend only on shared renderer modules'
      } else if (sourceLocation.layer === 'infrastructure'
        && ['app', 'features'].includes(targetLocation.layer)) {
        rule = 'infrastructure may depend on shared renderer modules, never app or features'
      } else if (sourceLocation.layer === 'features' && targetLocation.layer === 'app') {
        rule = 'features may not depend on app composition'
      } else if (sourceLocation.layer === 'features'
        && targetLocation.layer === 'features'
        && sourceLocation.feature !== targetLocation.feature
        && !isFeaturePublicEntry(rendererRoot, targetFile, targetLocation.feature)) {
        rule = `cross-feature imports must use features/${targetLocation.feature}/index`
      }

      if (rule) {
        violations.push({
          file,
          line: reference.line,
          column: reference.column,
          specifier: reference.specifier,
          targetFile,
          rule
        })
      }
    }
  }

  return violations
}

export function extractRendererSourcePaths(markdown) {
  const references = []
  const literalPathPattern = /src\/renderer\/src(?:\/[A-Za-z0-9_.@+$-]+)*/g

  for (const match of markdown.matchAll(literalPathPattern)) {
    const path = match[0].replace(/[.,;!?]+$/u, '')
    references.push({
      path,
      offset: match.index ?? 0
    })
  }

  return references
}

export function extractRendererAliasesFromMarkdownCode(markdown) {
  const references = []
  const aliasPattern = /@renderer(?:\/[A-Za-z0-9_.@+$-]+)*/g
  const lines = markdown.split('\n')
  let lineOffset = 0
  let fence

  const addAliases = (code, offset) => {
    for (const match of code.matchAll(aliasPattern)) {
      references.push({
        path: match[0],
        offset: offset + (match.index ?? 0)
      })
    }
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)

    if (fence) {
      if (fenceMatch
        && fenceMatch[1][0] === fence.character
        && fenceMatch[1].length >= fence.length) {
        fence = undefined
      } else {
        addAliases(line, lineOffset)
      }
    } else if (fenceMatch) {
      fence = {
        character: fenceMatch[1][0],
        length: fenceMatch[1].length
      }
    } else {
      const inlineCodePattern = /(`+)([^`\n]*?)\1/g
      for (const match of line.matchAll(inlineCodePattern)) {
        const code = match[2]
        const codeOffset = lineOffset + (match.index ?? 0) + match[1].length
        addAliases(code, codeOffset)
      }
    }

    lineOffset += line.length + 1
  }

  return references
}

async function rendererDocReferenceExists(repoRoot, reference) {
  if (!reference.path.startsWith('@renderer')) {
    return pathExists(join(repoRoot, reference.path))
  }

  const rendererRoot = join(repoRoot, 'src/renderer/src')
  const aliasPath = reference.path === '@renderer'
    ? rendererRoot
    : resolve(rendererRoot, reference.path.slice('@renderer/'.length))
  return await pathExists(aliasPath) || Boolean(await resolveModuleCandidate(aliasPath))
}

export async function checkActiveRendererDocPaths({ repoRoot, docsRoot = join(repoRoot, 'docs') }) {
  const markdownFiles = await collectFiles(docsRoot, (path) => path.endsWith('.md'))
  const violations = []

  for (const file of markdownFiles) {
    const relativeDocPath = relative(docsRoot, file)
    const [section] = relativeDocPath.split(sep)
    if (section === 'archive' || section === 'reference') continue

    const markdown = await readFile(file, 'utf8')
    if (/^Documentation mode:\s*Historical\s*$/mi.test(markdown)) continue
    const references = [
      ...extractRendererSourcePaths(markdown),
      ...extractRendererAliasesFromMarkdownCode(markdown)
    ]
    for (const reference of references) {
      if (await rendererDocReferenceExists(repoRoot, reference)) continue
      const line = markdown.slice(0, reference.offset).split('\n').length
      violations.push({ file, line, path: reference.path })
    }
  }

  return violations
}
