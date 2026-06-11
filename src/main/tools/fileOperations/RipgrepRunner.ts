import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { basename, dirname, isAbsolute, join, normalize } from 'path'

interface RipgrepSearchArgs {
  targetPath: string
  targetType: 'file' | 'directory'
  pattern: string
  regex: boolean
  caseSensitive: boolean
  maxResults: number
  filePattern?: string
}

export interface RipgrepMatch {
  file_path: string
  line: number
  content: string
  column: number
}

export interface RipgrepSearchResult {
  matches: RipgrepMatch[]
  total_matches: number
  files_searched: number
}

interface RipgrepFileListArgs {
  rootPath: string
  pattern: string
  maxResults: number
}

export interface RipgrepFileListResult {
  files: string[]
}

type RipgrepJsonEvent = {
  type?: string
  data?: {
    path?: { text?: string }
    lines?: { text?: string }
    line_number?: number
    submatches?: Array<{ start?: number }>
    stats?: {
      searches?: number
      searches_with_match?: number
    }
  }
}

const RIPGREP_IGNORED_DIRECTORY_GLOBS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.turbo',
  '.vite',
  '.cache',
  'coverage',
  '.xcode-*'
].flatMap((name) => [`!${name}/**`, `!**/${name}/**`])

function platformRipgrepName(): string {
  const executable = process.platform === 'win32' ? 'rg.exe' : 'rg'
  return join('ripgrep', `${process.platform}-${process.arch}`, executable)
}

export function resolveRipgrepCommand(): string {
  const packagedCandidate = join(process.resourcesPath || process.cwd(), 'native', platformRipgrepName())
  if (existsSync(packagedCandidate)) {
    return packagedCandidate
  }

  const devCandidate = join(process.cwd(), 'resources', 'native', platformRipgrepName())
  if (existsSync(devCandidate)) {
    return devCandidate
  }

  return process.platform === 'win32' ? 'rg.exe' : 'rg'
}

function normalizeRipgrepPath(value: string): string {
  const normalized = normalize(value).replace(/\\/g, '/')
  return normalized.startsWith('./') ? normalized.slice(2) : normalized
}

function toSearchContext(targetPath: string, targetType: 'file' | 'directory'): { cwd: string, searchPath: string } {
  if (targetType === 'file') {
    return { cwd: dirname(targetPath), searchPath: basename(targetPath) }
  }

  return { cwd: targetPath, searchPath: '.' }
}

function resolveMatchPath(cwd: string, value: string): string {
  return isAbsolute(value) ? value : join(cwd, value)
}

function toMatchContent(value: string): string {
  return value.replace(/\r?\n$/, '')
}

function parseJsonLine(line: string): RipgrepJsonEvent | undefined {
  if (!line.trim()) {
    return undefined
  }

  return JSON.parse(line) as RipgrepJsonEvent
}

export function runRipgrepSearch(args: RipgrepSearchArgs): Promise<RipgrepSearchResult> {
  const limit = Math.max(1, Math.floor(args.maxResults))
  const { cwd, searchPath } = toSearchContext(args.targetPath, args.targetType)
  const command = resolveRipgrepCommand()
  const argv = [
    '--json',
    '--column',
    '--line-number',
    '--hidden',
    '--no-ignore',
    '--no-messages',
    '--color',
    'never'
  ]

  if (!args.regex) {
    argv.push('-F')
  }

  if (!args.caseSensitive) {
    argv.push('-i')
  }

  for (const ignoredGlob of RIPGREP_IGNORED_DIRECTORY_GLOBS) {
    argv.push('--glob', ignoredGlob)
  }

  argv.push('--', args.pattern, searchPath)

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, argv, { cwd, windowsHide: true })
    const matches: RipgrepMatch[] = []
    const filesWithMatches = new Set<string>()
    const filePattern = args.filePattern ? new RegExp(args.filePattern) : undefined
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let resolved = false
    let reachedLimit = false
    let filesSearched: number | undefined

    const finish = (result: RipgrepSearchResult): void => {
      if (resolved) return
      resolved = true
      resolvePromise(result)
    }

    const fail = (error: Error): void => {
      if (resolved) return
      resolved = true
      reject(error)
    }

    const handleJsonEvent = (event: RipgrepJsonEvent | undefined): void => {
      if (!event?.type) return

      if (event.type === 'summary') {
        filesSearched = event.data?.stats?.searches
        return
      }

      if (event.type !== 'match') return

      const sourcePath = event.data?.path?.text
      const line = event.data?.line_number
      const content = event.data?.lines?.text
      if (!sourcePath || !line || content === undefined) return

      const absolutePath = resolveMatchPath(cwd, sourcePath)
      if (filePattern && !filePattern.test(basename(absolutePath))) {
        return
      }

      const firstSubmatch = event.data?.submatches?.[0]
      matches.push({
        file_path: absolutePath,
        line,
        content: toMatchContent(content),
        column: firstSubmatch?.start !== undefined ? firstSubmatch.start + 1 : 0
      })
      filesWithMatches.add(absolutePath)

      if (matches.length >= limit) {
        reachedLimit = true
        child.kill()
      }
    }

    const handleStdout = (chunk: Buffer): void => {
      stdoutBuffer += chunk.toString('utf-8')
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (reachedLimit) break
        handleJsonEvent(parseJsonLine(line))
      }
    }

    child.stdout.on('data', handleStdout)
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf-8')
    })
    child.on('error', fail)
    child.on('close', (code) => {
      if (!reachedLimit && stdoutBuffer.trim()) {
        try {
          handleJsonEvent(parseJsonLine(stdoutBuffer))
        } catch (error: any) {
          fail(error)
          return
        }
      }

      if (reachedLimit || code === 0 || code === 1) {
        finish({
          matches,
          total_matches: matches.length,
          files_searched: filesSearched ?? filesWithMatches.size
        })
        return
      }

      fail(new Error(stderrBuffer.trim() || `ripgrep exited with code ${code}`))
    })
  })
}

export function runRipgrepFileList(args: RipgrepFileListArgs): Promise<RipgrepFileListResult> {
  const limit = Math.max(1, Math.floor(args.maxResults))
  const command = resolveRipgrepCommand()
  const argv = [
    '--files',
    '--hidden',
    '--no-ignore',
    '--no-messages'
  ]

  for (const ignoredGlob of RIPGREP_IGNORED_DIRECTORY_GLOBS) {
    argv.push('--glob', ignoredGlob)
  }

  argv.push('--glob', args.pattern, '--', '.')

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, argv, { cwd: args.rootPath, windowsHide: true })
    const files: string[] = []
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let resolved = false
    let reachedLimit = false

    const finish = (result: RipgrepFileListResult): void => {
      if (resolved) return
      resolved = true
      resolvePromise(result)
    }

    const fail = (error: Error): void => {
      if (resolved) return
      resolved = true
      reject(error)
    }

    const addPath = (line: string): void => {
      const normalizedPath = normalizeRipgrepPath(line.trim())
      if (!normalizedPath) return

      files.push(normalizedPath)
      if (files.length >= limit) {
        reachedLimit = true
        child.kill()
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8')
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (reachedLimit) break
        addPath(line)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf-8')
    })
    child.on('error', fail)
    child.on('close', (code) => {
      if (!reachedLimit && stdoutBuffer.trim()) {
        addPath(stdoutBuffer)
      }

      if (reachedLimit || code === 0 || code === 1) {
        finish({ files })
        return
      }

      fail(new Error(stderrBuffer.trim() || `ripgrep exited with code ${code}`))
    })
  })
}
