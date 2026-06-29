import { knowledgebaseService } from '@main/services/knowledgebase/KnowledgebaseService'
import { createHash } from 'crypto'
import { readFile, writeFile, unlink, readdir, stat, mkdir, lstat, realpath } from 'fs/promises'
import path from 'path'
import { homedir } from 'os'
import YAML from 'yaml'
import type {
  WikiListResponse,
  WikiEntry,
  WikiReadResponse,
  WikiWriteArgs,
  WikiWriteResponse,
  WikiDeleteResponse,
  WikiSearchArgs,
  WikiSearchResponse,
  WikiIndexStatus,
  WikiSearchMatchSource
} from '@tools/wiki/index.d'

type WikiMetadata = Record<string, unknown>
type WikiPath = {
  root: string
  relativePath: string
  absolutePath: string
  name: string
}
type WikiWriteMode = NonNullable<WikiWriteArgs['mode']>
type WikiIndexState = {
  status: WikiIndexStatus
  message: string
}
type WikiIndexRefreshScheduler = WikiIndexState & {
  writtenGeneration: number
  runningGeneration: number
  indexedGeneration: number
  timer?: ReturnType<typeof setTimeout>
  runningPromise?: Promise<void>
}
type ParsedReadmeIndex = {
  entries: WikiEntry[]
  checksum: string
}
type ReadmeMatch = {
  entry: WikiEntry
  score: number
  reasons: string[]
}

const DEFAULT_WIKI_ROOT = path.join(homedir(), '.ati', 'wiki')
const DEFAULT_WIKI_CHUNK_SIZE = 1200
const DEFAULT_WIKI_CHUNK_OVERLAP = 200
const README_MATCH_SCORE_THRESHOLD = 0.12
const VECTOR_README_BOOST_MAX = 0.18
const FRONTMATTER_ORDER = ['title', 'type', 'tags', 'created', 'updated', 'source']
const INVALID_SEGMENT_CHARS = /[<>:"|?*\u0000]/
const README_FILE_NAME = 'README.md'
const README_INDEX_START = '<!-- ati-wiki-index:start -->'
const README_INDEX_END = '<!-- ati-wiki-index:end -->'
const README_INDEX_COLUMNS = ['Entry', 'Title', 'Type', 'Tags', 'Created', 'Updated', 'Source', 'Summary'] as const
const README_INDEX_CHECKSUM_PATTERN = /^<!--\s*ati-wiki-index:checksum=v1:sha256:([a-f0-9]{64})\s*-->$/
const WIKI_WRITE_MODES = new Set<WikiWriteMode>(['upsert', 'create', 'append', 'replace'])
const WIKI_INDEX_REFRESH_DEBOUNCE_MS = 50

const wikiIndexRefreshSchedulers = new Map<string, WikiIndexRefreshScheduler>()
const wikiReadmeIndexLocks = new Map<string, Promise<void>>()

function getWikiRoot(): string {
  const envRoot = process.env.ATI_WIKI_ROOT?.trim()
  return path.resolve(envRoot || DEFAULT_WIKI_ROOT)
}

function todayString(): string {
  return new Date().toISOString().split('T')[0]
}

function entryName(file: string): string {
  return file
    .replace(/\.md$/i, '')
    .split(path.sep)
    .join('/')
}

function assertSafeSegment(segment: string): void {
  if (!segment || segment === '.' || segment === '..' || segment.startsWith('.') || INVALID_SEGMENT_CHARS.test(segment)) {
    throw new Error('Invalid wiki entry name. Use a safe file name or controlled subpath.')
  }
}

function resolveWikiPath(name: string): WikiPath {
  const root = getWikiRoot()
  const trimmed = name.trim()
  if (!trimmed || path.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)) {
    throw new Error('Invalid wiki entry name. Use a safe file name or controlled subpath.')
  }

  const normalized = trimmed.replace(/\\/g, '/')
  const segments = normalized.split('/').map(segment => segment.trim())
  if (segments.length === 0 || segments.some(segment => !segment)) {
    throw new Error('Invalid wiki entry name. Use a safe file name or controlled subpath.')
  }

  segments.forEach(assertSafeSegment)
  const lastIndex = segments.length - 1
  const baseName = segments[lastIndex].replace(/\.md$/i, '')
  assertSafeSegment(baseName)
  segments[lastIndex] = `${baseName}.md`

  const relativePath = path.join(...segments)
  if (relativePath.toLowerCase() === README_FILE_NAME.toLowerCase()) {
    throw new Error('README.md is reserved for the managed wiki index.')
  }

  const absolutePath = path.resolve(root, relativePath)
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  if (absolutePath !== root && !absolutePath.startsWith(rootWithSeparator)) {
    throw new Error('Invalid wiki entry name. Use a safe file name or controlled subpath.')
  }

  return {
    root,
    relativePath,
    absolutePath,
    name: entryName(relativePath)
  }
}

function isFileSystemNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  return 'code' in error && (error as { code?: string }).code === 'ENOENT'
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

async function resolveExistingWikiRoot(root: string): Promise<string | undefined> {
  const rootStat = await stat(root).catch((error) => {
    if (isFileSystemNotFound(error)) {
      return undefined
    }
    throw error
  })

  if (!rootStat) {
    return undefined
  }
  if (!rootStat.isDirectory()) {
    throw new Error('Wiki root must be a directory.')
  }

  return realpath(root)
}

async function assertWikiParentsInsideRoot(
  root: string,
  relativePath: string,
  rootRealPath: string,
  options: { allowMissing: boolean }
): Promise<void> {
  const segments = relativePath.split(path.sep).filter(Boolean).slice(0, -1)
  let currentPath = root

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment)
    const currentStat = await lstat(currentPath).catch((error) => {
      if (isFileSystemNotFound(error) && options.allowMissing) {
        return undefined
      }
      throw error
    })

    if (!currentStat) {
      continue
    }
    if (currentStat.isSymbolicLink()) {
      throw new Error('Wiki entry parent path contains a symbolic link.')
    }
    if (!currentStat.isDirectory()) {
      throw new Error('Wiki entry parent path must be a directory.')
    }

    const currentRealPath = await realpath(currentPath)
    if (!isPathInsideRoot(rootRealPath, currentRealPath)) {
      throw new Error('Wiki entry parent path resolves outside wiki root.')
    }
  }
}

async function resolveExistingWikiFile(wikiPath: WikiPath): Promise<boolean> {
  const rootRealPath = await resolveExistingWikiRoot(wikiPath.root)
  if (!rootRealPath) {
    return false
  }

  await assertWikiParentsInsideRoot(wikiPath.root, wikiPath.relativePath, rootRealPath, { allowMissing: true })
  const fileStat = await lstat(wikiPath.absolutePath).catch((error) => {
    if (isFileSystemNotFound(error)) {
      return undefined
    }
    throw error
  })

  if (!fileStat) {
    return false
  }
  if (fileStat.isSymbolicLink()) {
    throw new Error('Wiki entry path contains a symbolic link.')
  }
  if (!fileStat.isFile()) {
    throw new Error('Wiki entry path must be a file.')
  }

  const fileRealPath = await realpath(wikiPath.absolutePath)
  if (!isPathInsideRoot(rootRealPath, fileRealPath)) {
    throw new Error('Wiki entry path resolves outside wiki root.')
  }

  return true
}

async function readExistingWikiFile(wikiPath: WikiPath): Promise<string | undefined> {
  const exists = await resolveExistingWikiFile(wikiPath)
  return exists ? readFile(wikiPath.absolutePath, 'utf-8') : undefined
}

async function prepareWikiFileForWrite(wikiPath: WikiPath): Promise<string | undefined> {
  await mkdir(wikiPath.root, { recursive: true })
  const rootRealPath = await resolveExistingWikiRoot(wikiPath.root)
  if (!rootRealPath) {
    throw new Error('Wiki root must exist before writing.')
  }

  await assertWikiParentsInsideRoot(wikiPath.root, wikiPath.relativePath, rootRealPath, { allowMissing: true })
  await mkdir(path.dirname(wikiPath.absolutePath), { recursive: true })
  await assertWikiParentsInsideRoot(wikiPath.root, wikiPath.relativePath, rootRealPath, { allowMissing: false })

  const fileStat = await lstat(wikiPath.absolutePath).catch((error) => {
    if (isFileSystemNotFound(error)) {
      return undefined
    }
    throw error
  })

  if (!fileStat) {
    return undefined
  }
  if (fileStat.isSymbolicLink()) {
    throw new Error('Wiki entry path contains a symbolic link.')
  }
  if (!fileStat.isFile()) {
    throw new Error('Wiki entry path must be a file.')
  }

  const fileRealPath = await realpath(wikiPath.absolutePath)
  if (!isPathInsideRoot(rootRealPath, fileRealPath)) {
    throw new Error('Wiki entry path resolves outside wiki root.')
  }

  return readFile(wikiPath.absolutePath, 'utf-8')
}

async function assertReadmePathForWrite(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
  const rootRealPath = await resolveExistingWikiRoot(root)
  if (!rootRealPath) {
    throw new Error('Wiki root must exist before writing README index.')
  }

  const readmePath = path.join(root, README_FILE_NAME)
  const readmeStat = await lstat(readmePath).catch((error) => {
    if (isFileSystemNotFound(error)) {
      return undefined
    }
    throw error
  })

  if (!readmeStat) {
    return
  }
  if (readmeStat.isSymbolicLink()) {
    throw new Error('Wiki README path contains a symbolic link.')
  }
  if (!readmeStat.isFile()) {
    throw new Error('Wiki README path must be a file.')
  }

  const readmeRealPath = await realpath(readmePath)
  if (!isPathInsideRoot(rootRealPath, readmeRealPath)) {
    throw new Error('Wiki README path resolves outside wiki root.')
  }
}

async function withReadmeIndexLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const lockKey = path.resolve(root)
  const previous = wikiReadmeIndexLocks.get(lockKey) ?? Promise.resolve()
  let releaseCurrent!: () => void
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve
  })
  const tail = previous.catch(() => undefined).then(() => current)
  wikiReadmeIndexLocks.set(lockKey, tail)

  await previous.catch(() => undefined)
  try {
    return await task()
  } finally {
    releaseCurrent()
    if (wikiReadmeIndexLocks.get(lockKey) === tail) {
      wikiReadmeIndexLocks.delete(lockKey)
    }
  }
}

function parseFrontmatter(raw: string): { metadata: WikiMetadata; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/)
  if (!match) {
    return { metadata: {}, body: raw }
  }

  try {
    const parsed = YAML.parse(match[1])
    const metadata = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as WikiMetadata
      : {}
    return { metadata, body: match[2] ?? '' }
  } catch {
    return { metadata: {}, body: match[2] ?? '' }
  }
}

function coerceDateString(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0]
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  return undefined
}

function coerceString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function coerceTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

function titleFromName(name: string): string {
  const baseName = name.split('/').at(-1) || name
  return baseName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function orderMetadata(metadata: WikiMetadata): WikiMetadata {
  const ordered: WikiMetadata = {}
  FRONTMATTER_ORDER.forEach((key) => {
    if (metadata[key] !== undefined) {
      ordered[key] = metadata[key]
    }
  })
  Object.keys(metadata)
    .filter(key => !FRONTMATTER_ORDER.includes(key))
    .sort()
    .forEach((key) => {
      ordered[key] = metadata[key]
    })
  return ordered
}

function serializeWikiContent(metadata: WikiMetadata, body: string): string {
  const yaml = YAML.stringify(orderMetadata(metadata)).trimEnd()
  return `---\n${yaml}\n---\n\n${body}\n`
}

function buildWriteContent(name: string, inputContent: string, existingContent?: string): string {
  const incoming = parseFrontmatter(inputContent)
  const existing = existingContent ? parseFrontmatter(existingContent) : undefined
  const now = todayString()
  const metadata: WikiMetadata = {
    ...incoming.metadata
  }
  metadata.title = coerceString(metadata.title) || titleFromName(name)
  metadata.type = coerceString(metadata.type) || 'note'
  metadata.tags = coerceTags(metadata.tags)
  metadata.created = coerceDateString(existing?.metadata.created) || coerceDateString(metadata.created) || now
  metadata.updated = now
  metadata.source = coerceString(metadata.source) || 'user'

  const body = incoming.body.trim()
  return serializeWikiContent(metadata, body)
}

function buildAppendContent(name: string, inputContent: string, existingContent: string): string {
  const incoming = parseFrontmatter(inputContent)
  const appendBody = incoming.body.trim()
  if (!appendBody) {
    throw new Error('append mode requires non-empty body content.')
  }

  const existing = parseFrontmatter(existingContent)
  const now = todayString()
  const metadata: WikiMetadata = {
    ...existing.metadata
  }

  if (metadata.title === undefined) {
    metadata.title = titleFromName(name)
  }
  if (metadata.type === undefined) {
    metadata.type = 'note'
  }
  if (metadata.tags === undefined) {
    metadata.tags = []
  }
  if (metadata.created === undefined) {
    metadata.created = now
  }
  metadata.updated = now
  if (metadata.source === undefined) {
    metadata.source = 'user'
  }

  const existingBody = existing.body.trim()
  const body = existingBody ? `${existingBody}\n\n${appendBody}` : appendBody
  return serializeWikiContent(metadata, body)
}

function normalizeWikiWriteMode(mode: unknown): WikiWriteMode {
  if (mode === undefined) {
    return 'upsert'
  }

  if (typeof mode !== 'string' || !WIKI_WRITE_MODES.has(mode as WikiWriteMode)) {
    throw new Error('Invalid wiki_write mode. Use upsert, create, append, or replace.')
  }

  return mode as WikiWriteMode
}

function writeSuccessMessage(mode: WikiWriteMode, isNew: boolean, title: string): string {
  if (mode === 'append') {
    return `Appended wiki entry "${title}".`
  }
  if (mode === 'replace' && !isNew) {
    return `Replaced wiki entry "${title}".`
  }
  return isNew ? `Created wiki entry "${title}".` : `Updated wiki entry "${title}".`
}

function metadataToEntry(file: string, metadata: WikiMetadata, body: string): WikiEntry {
  const name = entryName(file)
  const summary = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean)
    ?.slice(0, 120) || ''

  return {
    name,
    title: coerceString(metadata.title) || name,
    type: coerceString(metadata.type) || 'note',
    tags: coerceTags(metadata.tags),
    created: coerceDateString(metadata.created) || '',
    updated: coerceDateString(metadata.updated) || '',
    source: coerceString(metadata.source) || 'user',
    summary
  }
}

function sortWikiEntries(entries: WikiEntry[]): WikiEntry[] {
  return [...entries].sort((a, b) => {
    const leftDate = b.updated || b.created
    const rightDate = a.updated || a.created
    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate)
    }
    return a.name.localeCompare(b.name)
  })
}

function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
}

function unescapeMarkdownTableCell(value: string): string {
  return value.replace(/\\\|/g, '|').trim()
}

function splitMarkdownTableRow(row: string): string[] {
  const trimmed = row.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    throw new Error('Invalid wiki README index table row.')
  }

  const body = trimmed.slice(1, -1)
  const cells: string[] = []
  let current = ''

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    const next = body[index + 1]
    if (char === '\\' && next === '|') {
      current += '\\|'
      index += 1
      continue
    }
    if (char === '|') {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }

  cells.push(current)
  return cells.map(unescapeMarkdownTableCell)
}

function stripMarkdownCode(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^`([\s\S]*)`$/)
  return match ? match[1].trim() : trimmed
}

function renderTagsCell(tags: string[]): string {
  return tags.join(', ')
}

function parseTagsCell(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }

  const codeTags = Array.from(trimmed.matchAll(/`([^`]*)`/g), match => match[1].trim()).filter(Boolean)
  if (codeTags.length > 0) {
    return codeTags
  }

  return trimmed
    .split(',')
    .map(tag => stripMarkdownCode(tag).trim())
    .filter(Boolean)
}

function renderIndexTableRow(entry: WikiEntry): string {
  const cells = [
    entry.name,
    entry.title,
    entry.type,
    renderTagsCell(entry.tags),
    entry.created,
    entry.updated,
    entry.source,
    entry.summary
  ].map(escapeMarkdownTableCell)

  return `| ${cells.join(' | ')} |`
}

function calculateReadmeIndexChecksum(entries: WikiEntry[]): string {
  const normalized = entries
    .map(entry => ({
      name: entry.name.trim(),
      title: entry.title.trim(),
      type: entry.type.trim(),
      updated: entry.updated.trim(),
      summary: entry.summary.trim()
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
}

function renderReadmeIndexChecksum(entries: WikiEntry[]): string {
  return `<!-- ati-wiki-index:checksum=v1:sha256:${calculateReadmeIndexChecksum(entries)} -->`
}

function renderReadmeIndexBlock(entries: WikiEntry[]): string {
  const header = `| ${README_INDEX_COLUMNS.join(' | ')} |`
  const separator = `| ${README_INDEX_COLUMNS.map(() => '---').join(' | ')} |`
  const rows = sortWikiEntries(entries).map(renderIndexTableRow)
  return [
    README_INDEX_START,
    renderReadmeIndexChecksum(entries),
    header,
    separator,
    ...rows,
    README_INDEX_END
  ].join('\n')
}

function renderReadmeWithIndex(existingReadme: string | undefined, entries: WikiEntry[]): string {
  const block = renderReadmeIndexBlock(entries)
  if (!existingReadme) {
    return `# Wiki Index\n\n${block}\n`
  }

  const startIndex = existingReadme.indexOf(README_INDEX_START)
  const endIndex = existingReadme.indexOf(README_INDEX_END)
  if (startIndex >= 0 && endIndex > startIndex) {
    const afterEndIndex = endIndex + README_INDEX_END.length
    return `${existingReadme.slice(0, startIndex)}${block}${existingReadme.slice(afterEndIndex)}`
  }

  const separator = existingReadme.endsWith('\n') ? '\n' : '\n\n'
  return `${existingReadme}${separator}${block}\n`
}

function parseReadmeIndexChecksum(block: string): string {
  const checksumLines = block
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('<!-- ati-wiki-index:checksum='))

  if (checksumLines.length !== 1) {
    throw new Error('README index checksum is missing.')
  }

  const match = checksumLines[0].match(README_INDEX_CHECKSUM_PATTERN)
  if (!match) {
    throw new Error('README index checksum is invalid.')
  }

  return match[1]
}

function parseReadmeIndex(raw: string): ParsedReadmeIndex {
  const startIndex = raw.indexOf(README_INDEX_START)
  const endIndex = raw.indexOf(README_INDEX_END)
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error('README index managed block is missing.')
  }

  const block = raw.slice(startIndex + README_INDEX_START.length, endIndex)
  const checksum = parseReadmeIndexChecksum(block)
  const tableLines = block
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('|'))

  if (tableLines.length < 2) {
    throw new Error('README index table is missing.')
  }

  const headerCells = splitMarkdownTableRow(tableLines[0])
  if (
    headerCells.length !== README_INDEX_COLUMNS.length
    || headerCells.some((cell, index) => cell !== README_INDEX_COLUMNS[index])
  ) {
    throw new Error('README index table header is invalid.')
  }

  const separatorCells = splitMarkdownTableRow(tableLines[1])
  if (
    separatorCells.length !== README_INDEX_COLUMNS.length
    || separatorCells.some(cell => !/^:?-{3,}:?$/.test(cell))
  ) {
    throw new Error('README index table separator is invalid.')
  }

  const entries = tableLines.slice(2).map((line) => {
    const cells = splitMarkdownTableRow(line)
    if (cells.length !== README_INDEX_COLUMNS.length) {
      throw new Error('README index table row is invalid.')
    }

    const name = stripMarkdownCode(cells[0])
    if (!name || name.endsWith('.md')) {
      throw new Error('README index entry name is invalid.')
    }

    return {
      name,
      title: cells[1] || name,
      type: cells[2] || 'note',
      tags: parseTagsCell(cells[3]),
      created: cells[4],
      updated: cells[5],
      source: cells[6] || 'user',
      summary: cells[7]
    }
  })

  if (calculateReadmeIndexChecksum(entries) !== checksum) {
    throw new Error('README index checksum does not match table contents.')
  }

  return {
    entries,
    checksum
  }
}

async function readReadme(root: string): Promise<string | undefined> {
  const rootRealPath = await resolveExistingWikiRoot(root)
  if (!rootRealPath) {
    return undefined
  }

  const readmePath = path.join(root, README_FILE_NAME)
  const readmeStat = await lstat(readmePath).catch((error) => {
    if (isFileSystemNotFound(error)) {
      return undefined
    }
    throw error
  })

  if (!readmeStat) {
    return undefined
  }
  if (readmeStat.isSymbolicLink()) {
    throw new Error('Wiki README path contains a symbolic link.')
  }
  if (!readmeStat.isFile()) {
    throw new Error('Wiki README path must be a file.')
  }

  const readmeRealPath = await realpath(readmePath)
  if (!isPathInsideRoot(rootRealPath, readmeRealPath)) {
    throw new Error('Wiki README path resolves outside wiki root.')
  }

  return readFile(readmePath, 'utf-8')
}

async function writeReadmeIndex(root: string, entries: WikiEntry[], existingReadme?: string): Promise<void> {
  await assertReadmePathForWrite(root)
  await writeFile(path.join(root, README_FILE_NAME), renderReadmeWithIndex(existingReadme, entries), 'utf-8')
}

async function validateReadmeIndexEntries(entries: WikiEntry[]): Promise<void> {
  await Promise.all(entries.map(async (entry) => {
    const wikiPath = resolveWikiPath(entry.name)
    const exists = await resolveExistingWikiFile(wikiPath)
    if (!exists) {
      throw new Error(`README index entry "${entry.name}" does not reference an existing wiki file.`)
    }
  }))
}

async function scanWikiEntries(root: string): Promise<WikiEntry[]> {
  const files = await listMarkdownFiles(root)
  const entries: WikiEntry[] = []
  for (const file of files) {
    const wikiPath = resolveWikiPath(file)
    const raw = await readExistingWikiFile(wikiPath)
    if (raw === undefined) {
      continue
    }
    const { metadata, body } = parseFrontmatter(raw)
    entries.push(metadataToEntry(file, metadata, body))
  }
  return sortWikiEntries(entries)
}

async function loadEntriesForIndexMutation(root: string, existingReadme: string | undefined): Promise<WikiEntry[]> {
  if (!existingReadme) {
    return scanWikiEntries(root)
  }

  try {
    const { entries } = parseReadmeIndex(existingReadme)
    await validateReadmeIndexEntries(entries)
    return entries
  } catch {
    return scanWikiEntries(root)
  }
}

async function loadEntriesForSearch(root: string): Promise<WikiEntry[]> {
  const existingReadme = await readReadme(root).catch(() => undefined)
  if (existingReadme) {
    try {
      const { entries } = parseReadmeIndex(existingReadme)
      await validateReadmeIndexEntries(entries)
      return sortWikiEntries(entries)
    } catch {
      return scanWikiEntries(root)
    }
  }

  return scanWikiEntries(root)
}

async function upsertReadmeIndexEntry(root: string, entry: WikiEntry): Promise<void> {
  await withReadmeIndexLock(root, async () => {
    const existingReadme = await readReadme(root)
    const entries = await loadEntriesForIndexMutation(root, existingReadme)
    const byName = new Map(entries.map(item => [item.name, item]))
    byName.set(entry.name, entry)
    await writeReadmeIndex(root, Array.from(byName.values()), existingReadme)
  })
}

async function removeReadmeIndexEntry(root: string, name: string): Promise<void> {
  await withReadmeIndexLock(root, async () => {
    const existingReadme = await readReadme(root)
    let entries: WikiEntry[]
    if (existingReadme) {
      try {
        entries = parseReadmeIndex(existingReadme).entries.filter(item => item.name !== name)
      } catch {
        entries = await scanWikiEntries(root)
      }
    } else {
      entries = await scanWikiEntries(root)
    }
    await writeReadmeIndex(root, entries, existingReadme)
  })
}

async function listMarkdownFiles(root: string, currentDir = root): Promise<string[]> {
  try {
    const entries = await readdir(currentDir, { withFileTypes: true })
    const files: string[] = []
    for (const item of entries) {
      const absolutePath = path.join(currentDir, item.name)
      if (item.isDirectory()) {
        if (item.name.startsWith('.')) {
          continue
        }
        files.push(...await listMarkdownFiles(root, absolutePath))
        continue
      }
      const relativePath = path.relative(root, absolutePath)
      if (item.isFile() && item.name.endsWith('.md') && relativePath.toLowerCase() !== README_FILE_NAME.toLowerCase()) {
        files.push(relativePath)
      }
    }
    return files.sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }
}

function createWikiIndexRefreshScheduler(): WikiIndexRefreshScheduler {
  return {
    status: 'unknown',
    message: 'Wiki index has not been refreshed by wiki tools in this process.',
    writtenGeneration: 0,
    runningGeneration: 0,
    indexedGeneration: 0
  }
}

function getWikiIndexRefreshScheduler(root: string): WikiIndexRefreshScheduler {
  const normalizedRoot = path.resolve(root)
  const existing = wikiIndexRefreshSchedulers.get(normalizedRoot)
  if (existing) {
    return existing
  }

  const scheduler = createWikiIndexRefreshScheduler()
  wikiIndexRefreshSchedulers.set(normalizedRoot, scheduler)
  return scheduler
}

function getWikiIndexSnapshot(root: string): WikiIndexState {
  const scheduler = getWikiIndexRefreshScheduler(root)
  return {
    status: scheduler.status,
    message: scheduler.message
  }
}

function buildQueuedIndexMessage(scheduler: WikiIndexRefreshScheduler, previousStaleMessage?: string): string {
  const previousState = previousStaleMessage
    ? ` Previous index state: stale. ${previousStaleMessage}`
    : ''
  return `Wiki index refresh queued for generation ${scheduler.writtenGeneration}.${previousState}`
}

function queueWikiIndexRefresh(root: string, scheduler: WikiIndexRefreshScheduler): void {
  if (scheduler.timer) {
    clearTimeout(scheduler.timer)
  }

  const previousStaleMessage = scheduler.status === 'stale' ? scheduler.message : undefined
  scheduler.status = 'queued'
  scheduler.message = buildQueuedIndexMessage(scheduler, previousStaleMessage)
  scheduler.timer = setTimeout(() => {
    scheduler.timer = undefined
    startWikiIndexRefresh(root, scheduler)
  }, WIKI_INDEX_REFRESH_DEBOUNCE_MS)
}

function isKnowledgebaseIndexBusy(): boolean {
  const service = knowledgebaseService as {
    getStatus?: () => { state?: string }
  }
  const state = service.getStatus?.()?.state
  return state !== undefined && state !== 'idle' && state !== 'completed'
}

async function runKnowledgebaseWikiReindex(root: string): Promise<void> {
  const joinedExistingIndexJob = isKnowledgebaseIndexBusy()
  await knowledgebaseService.reindex({
    force: false,
    configOverride: {
      enabled: true,
      folders: [root],
      chunkSize: DEFAULT_WIKI_CHUNK_SIZE,
      chunkOverlap: DEFAULT_WIKI_CHUNK_OVERLAP
    }
  })

  if (joinedExistingIndexJob) {
    await knowledgebaseService.reindex({
      force: false,
      configOverride: {
        enabled: true,
        folders: [root],
        chunkSize: DEFAULT_WIKI_CHUNK_SIZE,
        chunkOverlap: DEFAULT_WIKI_CHUNK_OVERLAP
      }
    })
  }
}

function startWikiIndexRefresh(root: string, scheduler: WikiIndexRefreshScheduler): void {
  if (scheduler.runningPromise || scheduler.indexedGeneration >= scheduler.writtenGeneration) {
    return
  }

  const generation = scheduler.writtenGeneration
  scheduler.runningGeneration = generation
  scheduler.status = 'running'
  scheduler.message = `Wiki index refresh is running for generation ${generation}.`
  scheduler.runningPromise = (async () => {
    try {
      await runKnowledgebaseWikiReindex(root)
      scheduler.indexedGeneration = Math.max(scheduler.indexedGeneration, generation)
      if (scheduler.writtenGeneration <= scheduler.indexedGeneration) {
        scheduler.status = 'fresh'
        scheduler.message = `Wiki index is fresh for generation ${scheduler.indexedGeneration}.`
      }
    } catch (error) {
      scheduler.status = 'stale'
      scheduler.message = `Wiki source files and README were updated, and wiki index refresh failed for generation ${generation}: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      scheduler.runningPromise = undefined
      if (scheduler.writtenGeneration > generation) {
        queueWikiIndexRefresh(root, scheduler)
      }
    }
  })()
}

function scheduleWikiIndexRefresh(root: string): WikiIndexState {
  const scheduler = getWikiIndexRefreshScheduler(root)
  scheduler.writtenGeneration += 1

  if (scheduler.runningPromise) {
    scheduler.status = 'running'
    scheduler.message = `Wiki index refresh is running for generation ${scheduler.runningGeneration}; generation ${scheduler.writtenGeneration} will refresh after it settles.`
    return getWikiIndexSnapshot(root)
  }

  queueWikiIndexRefresh(root, scheduler)
  return getWikiIndexSnapshot(root)
}

export function __resetWikiIndexRefreshSchedulersForTests(): void {
  for (const scheduler of wikiIndexRefreshSchedulers.values()) {
    if (scheduler.timer) {
      clearTimeout(scheduler.timer)
    }
  }
  wikiIndexRefreshSchedulers.clear()
  wikiReadmeIndexLocks.clear()
}

function normalizeQueryCandidate(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function uniqueQueryCandidates(query: string, localizedQuery: string): string[] {
  return Array.from(new Set([query, localizedQuery]))
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[-_/\\]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueSearchTerms(candidates: string[]): string[] {
  return Array.from(new Set(
    candidates
      .flatMap(candidate => normalizeSearchText(candidate).split(/\s+/))
      .map(term => term.trim())
      .filter(Boolean)
  ))
}

function tokenOverlapScore(terms: string[], fieldText: string): number {
  if (terms.length === 0 || !fieldText) {
    return 0
  }

  const hits = terms.filter(term => fieldText.includes(term)).length
  return hits / terms.length
}

function addReadmeReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason)
  }
}

function scoreReadmeEntry(entry: WikiEntry, candidates: string[]): ReadmeMatch | null {
  const phrases = candidates
    .map(normalizeSearchText)
    .filter(Boolean)
  const terms = uniqueSearchTerms(candidates)
  const nameText = normalizeSearchText(entry.name)
  const titleText = normalizeSearchText(entry.title)
  const typeText = normalizeSearchText(entry.type)
  const tagsText = normalizeSearchText(entry.tags.join(' '))
  const summaryText = normalizeSearchText(entry.summary)
  const reasons: string[] = []
  let score = 0

  for (const phrase of phrases) {
    if (!phrase) {
      continue
    }
    if (nameText === phrase || titleText === phrase) {
      score += 0.5
      addReadmeReason(reasons, 'README title or entry name exact match')
      continue
    }
    if (nameText.includes(phrase)) {
      score += 0.4
      addReadmeReason(reasons, 'README entry name match')
    }
    if (titleText.includes(phrase)) {
      score += 0.38
      addReadmeReason(reasons, 'README title match')
    }
    if (summaryText.includes(phrase)) {
      score += 0.24
      addReadmeReason(reasons, 'README summary match')
    }
    if (tagsText.includes(phrase)) {
      score += 0.16
      addReadmeReason(reasons, 'README tag match')
    }
    if (typeText.includes(phrase)) {
      score += 0.08
      addReadmeReason(reasons, 'README type match')
    }
  }

  const nameOverlap = tokenOverlapScore(terms, nameText)
  if (nameOverlap > 0) {
    score += nameOverlap * 0.24
    addReadmeReason(reasons, 'README entry name token match')
  }

  const titleOverlap = tokenOverlapScore(terms, titleText)
  if (titleOverlap > 0) {
    score += titleOverlap * 0.22
    addReadmeReason(reasons, 'README title token match')
  }

  const summaryOverlap = tokenOverlapScore(terms, summaryText)
  if (summaryOverlap > 0) {
    score += summaryOverlap * 0.12
    addReadmeReason(reasons, 'README summary token match')
  }

  const tagOverlap = tokenOverlapScore(terms, tagsText)
  if (tagOverlap > 0) {
    score += tagOverlap * 0.08
    addReadmeReason(reasons, 'README tag token match')
  }

  const normalizedScore = Math.min(score, 1)
  if (normalizedScore < README_MATCH_SCORE_THRESHOLD) {
    return null
  }

  return {
    entry,
    score: Number(normalizedScore.toFixed(4)),
    reasons
  }
}

function rankReadmeMatches(entries: WikiEntry[], candidates: string[]): ReadmeMatch[] {
  return entries
    .map(entry => scoreReadmeEntry(entry, candidates))
    .filter((match): match is ReadmeMatch => Boolean(match))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      const rightDate = right.entry.updated || right.entry.created
      const leftDate = left.entry.updated || left.entry.created
      if (rightDate !== leftDate) {
        return rightDate.localeCompare(leftDate)
      }
      return left.entry.name.localeCompare(right.entry.name)
    })
}

function formatReadmeReasons(reasons: string[]): string {
  return reasons.slice(0, 3).join('; ') || 'README metadata match'
}

function wikiEntryNameFromFilePath(root: string, filePath: string): string | undefined {
  const relativePath = path.relative(root, filePath)
  if (
    !relativePath
    || relativePath.startsWith('..')
    || path.isAbsolute(relativePath)
    || !relativePath.toLowerCase().endsWith('.md')
    || relativePath.toLowerCase() === README_FILE_NAME.toLowerCase()
  ) {
    return undefined
  }

  return entryName(relativePath)
}

function withIndexMessage(message: string, indexState: WikiIndexState): string {
  return `${message} Index status: ${indexState.status}. ${indexState.message}`
}

const WIKI_INDEX_UNCHANGED_MESSAGE = 'Wiki index unchanged.'

export async function processWikiList(): Promise<WikiListResponse> {
  const root = getWikiRoot()
  try {
    const readme = await readReadme(root).catch(() => undefined)
    if (readme) {
      try {
        const entries = sortWikiEntries(parseReadmeIndex(readme).entries)
        await validateReadmeIndexEntries(entries)
        return {
          success: true,
          entries,
          index_source: 'readme',
          message: `Found ${entries.length} wiki entries.`
        }
      } catch {
        const entries = await scanWikiEntries(root)
        return {
          success: true,
          entries,
          index_source: 'scan',
          message: `Found ${entries.length} wiki entries by scanning files. README index needs repair.`
        }
      }
    }

    const entries = await scanWikiEntries(root)
    return {
      success: true,
      entries,
      index_source: 'scan',
      message: `Found ${entries.length} wiki entries by scanning files. README index needs repair.`
    }
  } catch (error) {
    return {
      success: false,
      entries: [],
      message: `Failed to list wiki entries: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function processWikiRead(args: { name: string }): Promise<WikiReadResponse> {
  try {
    const wikiPath = resolveWikiPath(args.name)

    const raw = await readExistingWikiFile(wikiPath)
    if (raw === undefined) {
      return {
        success: false,
        name: wikiPath.name,
        message: `Wiki entry "${wikiPath.name}" not found.`
      }
    }

    const { metadata } = parseFrontmatter(raw)
    const title = coerceString(metadata.title) || wikiPath.name

    return {
      success: true,
      name: wikiPath.name,
      title,
      content: raw,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      message: `Read wiki entry "${title}".`
    }
  } catch (error) {
    return {
      success: false,
      name: args.name,
      message: `Failed to read wiki entry: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function processWikiWrite(args: WikiWriteArgs): Promise<WikiWriteResponse> {
  try {
    const mode = normalizeWikiWriteMode(args.mode)
    const wikiPath = resolveWikiPath(args.name)

    const existing = await prepareWikiFileForWrite(wikiPath)
    const isNew = existing === undefined
    if (mode === 'create' && existing !== undefined) {
      return {
        success: false,
        name: wikiPath.name,
        index_status: 'unknown',
        index_message: WIKI_INDEX_UNCHANGED_MESSAGE,
        message: `Wiki entry "${wikiPath.name}" already exists. create mode only writes new entries.`
      }
    }
    if (mode === 'append' && existing === undefined) {
      return {
        success: false,
        name: wikiPath.name,
        index_status: 'unknown',
        index_message: WIKI_INDEX_UNCHANGED_MESSAGE,
        message: `Wiki entry "${wikiPath.name}" not found. append mode requires an existing entry.`
      }
    }

    let content: string
    if (mode === 'append') {
      if (existing === undefined) {
        throw new Error('append mode requires an existing entry.')
      }
      content = buildAppendContent(wikiPath.name, args.content, existing)
    } else {
      content = buildWriteContent(wikiPath.name, args.content, existing)
    }

    await writeFile(wikiPath.absolutePath, content, 'utf-8')

    const { metadata, body } = parseFrontmatter(content)
    const title = coerceString(metadata.title) || wikiPath.name
    await upsertReadmeIndexEntry(wikiPath.root, metadataToEntry(wikiPath.relativePath, metadata, body))
    const indexState = scheduleWikiIndexRefresh(wikiPath.root)

    return {
      success: true,
      name: wikiPath.name,
      title,
      index_status: indexState.status,
      index_message: indexState.message,
      message: withIndexMessage(
        writeSuccessMessage(mode, isNew, title),
        indexState
      )
    }
  } catch (error) {
    return {
      success: false,
      name: args.name,
      index_status: 'unknown',
      index_message: WIKI_INDEX_UNCHANGED_MESSAGE,
      message: `Failed to write wiki entry: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function processWikiDelete(args: { name: string }): Promise<WikiDeleteResponse> {
  try {
    const wikiPath = resolveWikiPath(args.name)

    const exists = await resolveExistingWikiFile(wikiPath)
    if (!exists) {
      return {
        success: false,
        name: wikiPath.name,
        index_status: 'unknown',
        index_message: WIKI_INDEX_UNCHANGED_MESSAGE,
        message: `Wiki entry "${wikiPath.name}" not found.`
      }
    }

    await unlink(wikiPath.absolutePath)
    await removeReadmeIndexEntry(wikiPath.root, wikiPath.name)
    const indexState = scheduleWikiIndexRefresh(wikiPath.root)

    return {
      success: true,
      name: wikiPath.name,
      index_status: indexState.status,
      index_message: indexState.message,
      message: withIndexMessage(`Deleted wiki entry "${wikiPath.name}".`, indexState)
    }
  } catch (error) {
    return {
      success: false,
      name: args.name,
      index_status: 'unknown',
      index_message: WIKI_INDEX_UNCHANGED_MESSAGE,
      message: `Failed to delete wiki entry: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function processWikiSearch(args: WikiSearchArgs): Promise<WikiSearchResponse> {
  const root = getWikiRoot()
  try {
    const indexState = getWikiIndexSnapshot(root)
    const query = normalizeQueryCandidate(args.query)
    if (!query) {
      return {
        success: false,
        query: '',
        total_hits: 0,
        results: [],
        index_status: indexState.status,
        index_message: indexState.message,
        message: 'query is required'
      }
    }

    const localizedQuery = normalizeQueryCandidate(args.localized_query)
    if (!localizedQuery) {
      return {
        success: false,
        query,
        total_hits: 0,
        results: [],
        index_status: indexState.status,
        index_message: indexState.message,
        message: 'localized_query is required'
      }
    }

    const topK = Math.min(Math.max(Math.floor(args.top_k ?? 5), 1), 10)
    const vectorTopK = Math.min(Math.max(topK * 2, topK), 20)
    const threshold = typeof args.threshold === 'number'
      ? Math.min(Math.max(args.threshold, 0), 1)
      : undefined
    const queryCandidates = uniqueQueryCandidates(query, localizedQuery)
    const readmeEntries = await loadEntriesForSearch(root)
    const readmeMatches = rankReadmeMatches(readmeEntries, queryCandidates)
    const readmeMatchByName = new Map(readmeMatches.map(match => [match.entry.name, match]))
    const readmeEntryByName = new Map(readmeEntries.map(entry => [entry.name, entry]))

    const resultSets = await Promise.all(
      queryCandidates.map((candidate) =>
        knowledgebaseService.search(candidate, {
          topK: vectorTopK,
          threshold,
          folders: [root],
          extensions: ['.md']
        })
      )
    )

    const enrichedResultSets = resultSets.map(results =>
      results
        .map(item => enrichVectorWikiResult(item, root, readmeEntryByName, readmeMatchByName))
        .filter(item => item.entryName)
    )
    const vectorResults = mergeWikiResults(enrichedResultSets, vectorTopK)
    const vectorEntryNames = new Set(vectorResults.flatMap(item => item.entryName ? [item.entryName] : []))
    const readmeFallbackResults = readmeMatches
      .filter(match => !vectorEntryNames.has(match.entry.name))
      .map(match => buildReadmeFallbackResult(match))

    const merged = mergeWikiResults([vectorResults, readmeFallbackResults], topK)
    const hasReadmeFallback = merged.some(item => item.matchSource === 'readme')
    const resultMessage = merged.length > 0
      ? hasReadmeFallback
        ? `Found ${merged.length} wiki results. README index matches may need wiki_read for full page context.`
        : `Found ${merged.length} wiki results.`
      : 'No relevant wiki results found. The wiki index may need to be rebuilt.'
    const responseIndexState = getWikiIndexSnapshot(root)

    return {
      success: true,
      query,
      total_hits: merged.length,
      results: merged.map(item => ({
        entry_name: item.entryName!,
        title: item.title ?? item.entryName!,
        summary: item.summary,
        text: item.text,
        score: item.score,
        similarity: item.similarity,
        match_source: item.matchSource ?? 'vector',
        match_reason: item.matchReason ?? 'Vector chunk match'
      })),
      index_status: responseIndexState.status,
      index_message: responseIndexState.message,
      message: withIndexMessage(resultMessage, responseIndexState)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const indexState = getWikiIndexSnapshot(root)
    return {
      success: false,
      query: args.query ?? '',
      total_hits: 0,
      results: [],
      index_status: indexState.status,
      index_message: indexState.message,
      message: `Wiki search failed: ${message}`
    }
  }
}

interface WikiSearchItem {
  chunkId: string
  filePath?: string
  text: string
  chunkIndex: number
  score: number
  similarity: number
  entryName?: string
  title?: string
  summary?: string
  matchSource?: WikiSearchMatchSource
  matchReason?: string
}

function enrichVectorWikiResult(
  item: WikiSearchItem,
  root: string,
  readmeEntryByName: Map<string, WikiEntry>,
  readmeMatchByName: Map<string, ReadmeMatch>
): WikiSearchItem {
  const entryName = item.filePath ? wikiEntryNameFromFilePath(root, item.filePath) : undefined
  const readmeEntry = entryName ? readmeEntryByName.get(entryName) : undefined
  const readmeMatch = entryName ? readmeMatchByName.get(entryName) : undefined
  const readmeBoost = readmeMatch ? Math.min(readmeMatch.score * 0.3, VECTOR_README_BOOST_MAX) : 0
  const score = Number(Math.min(1, item.score + readmeBoost).toFixed(4))
  const matchSource: WikiSearchMatchSource = readmeMatch ? 'hybrid' : 'vector'
  const matchReason = readmeMatch
    ? `Vector chunk match; ${formatReadmeReasons(readmeMatch.reasons)}`
    : 'Vector chunk match'

  return {
    ...item,
    score,
    similarity: Number(item.similarity.toFixed(4)),
    entryName,
    title: readmeEntry?.title,
    summary: readmeEntry?.summary,
    matchSource,
    matchReason
  }
}

function buildReadmeFallbackText(entry: WikiEntry, match: ReadmeMatch): string {
  return [
    `Entry: ${entry.name}`,
    `Title: ${entry.title}`,
    entry.summary ? `Summary: ${entry.summary}` : undefined,
    `Match: ${formatReadmeReasons(match.reasons)}`,
    `Use wiki_read with name "${entry.name}" for full page context.`
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n')
}

function buildReadmeFallbackResult(match: ReadmeMatch): WikiSearchItem {
  const text = buildReadmeFallbackText(match.entry, match)
  return {
    chunkId: `readme:${match.entry.name}`,
    text,
    chunkIndex: 0,
    score: match.score,
    similarity: 0,
    entryName: match.entry.name,
    title: match.entry.title,
    summary: match.entry.summary,
    matchSource: 'readme',
    matchReason: formatReadmeReasons(match.reasons)
  }
}

function mergeWikiResults(resultSets: WikiSearchItem[][], topK: number): WikiSearchItem[] {
  const byChunkId = new Map<string, WikiSearchItem>()

  resultSets.forEach((results) => {
    results.forEach((item) => {
      const existing = byChunkId.get(item.chunkId)

      if (!existing) {
        byChunkId.set(item.chunkId, {
          ...item,
          score: Number(item.score.toFixed(4)),
          similarity: Number(item.similarity.toFixed(4))
        })
        return
      }

      if (item.score > existing.score) {
        byChunkId.set(item.chunkId, {
          ...item,
          score: Number(item.score.toFixed(4)),
          similarity: Number(item.similarity.toFixed(4))
        })
        return
      }

      byChunkId.set(item.chunkId, {
        ...existing,
        score: Number(Math.max(existing.score, item.score).toFixed(4)),
        similarity: Number(Math.max(existing.similarity, item.similarity).toFixed(4))
      })
    })
  })

  return Array.from(byChunkId.values())
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      if (b.similarity !== a.similarity) {
        return b.similarity - a.similarity
      }
      return a.chunkIndex - b.chunkIndex
    })
    .slice(0, topK)
}
