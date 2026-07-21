import { app } from 'electron'
import { isAbsolute, join, relative, resolve } from 'path'
import { chatDb } from '@main/db/chat'
import {
  canonicalizeThroughExistingPrefix,
  isPathWithin
} from './WorkspacePathBoundary'

export { isPathWithin } from './WorkspacePathBoundary'

const DEFAULT_WORKSPACE_NAME = 'tmp'

export type WorkspacePathMode = 'embedded-relative' | 'legacy-compatible'
export type WorkspacePathIntent = 'existing' | 'creatable' | 'traversal' | 'source' | 'destination'

export type WorkspacePathErrorCode =
  | 'PATH_INVALID_INPUT'
  | 'PATH_ABSOLUTE_REJECTED'
  | 'PATH_TRAVERSAL_REJECTED'
  | 'PATH_SYMLINK_ESCAPE'
  | 'PATH_CANONICALIZATION_FAILED'

export class WorkspacePathError extends Error {
  constructor(
    public readonly code: WorkspacePathErrorCode,
    message: string,
    public readonly inputPath: string
  ) {
    super(`${code}: ${message}`)
    this.name = 'WorkspacePathError'
  }
}

export interface ResolveWorkspacePathOptions {
  chatUuid?: string
  mode: WorkspacePathMode
  intent: WorkspacePathIntent
  workspaceRootOverride?: string
}

export interface ResolvedWorkspacePath {
  absolutePath: string
  relativePath: string
  workspaceRoot: string
  canonicalWorkspaceRoot: string
  canonicalPath: string
  intent: WorkspacePathIntent
  legacyInput: boolean
}

function hasWindowsAbsoluteForm(value: string): boolean {
  return /^[a-zA-Z]:/.test(value) || /^[/\\]{2}/.test(value) || /^\\/.test(value)
}

function hasParentSegment(value: string): boolean {
  return value.split(/[\\/]+/).some(segment => segment === '..')
}

function normalizeWorkspaceBaseDir(workspacePath: string, chatUuid?: string): string {
  const userDataPath = app.getPath('userData')
  const fallbackDir = join(userDataPath, 'workspaces', chatUuid || DEFAULT_WORKSPACE_NAME)

  if (!workspacePath) return fallbackDir
  if (isAbsolute(workspacePath)) return resolve(workspacePath)

  const normalized = workspacePath.replace(/\\/g, '/')
  const clean = normalized.startsWith('./') ? normalized.slice(2) : normalized
  if (clean.startsWith('workspaces/')) return resolve(join(userDataPath, clean))

  return resolve(join(userDataPath, clean))
}

export function resolveWorkspaceRoot(chatUuid?: string, workspaceRootOverride?: string): string {
  if (workspaceRootOverride) return resolve(workspaceRootOverride)

  const userDataPath = app.getPath('userData')
  if (!chatUuid) return join(userDataPath, 'workspaces', DEFAULT_WORKSPACE_NAME)

  try {
    const workspacePath = chatDb.getWorkspacePathByUuid(chatUuid)
    if (workspacePath) return normalizeWorkspaceBaseDir(workspacePath, chatUuid)
  } catch {
    // The chat-specific fallback below is the stable workspace boundary.
  }

  return join(userDataPath, 'workspaces', chatUuid)
}

function validateLexicalInput(inputPath: string): void {
  if (typeof inputPath !== 'string' || inputPath.length === 0 || inputPath.includes('\0')) {
    throw new WorkspacePathError('PATH_INVALID_INPUT', 'Path must be a non-empty string without NUL bytes', inputPath)
  }

  if (hasParentSegment(inputPath)) {
    throw new WorkspacePathError('PATH_TRAVERSAL_REJECTED', 'Parent path segments are outside the workspace contract', inputPath)
  }
}

function resolveLegacyInput(inputPath: string, workspaceRoot: string): { absolutePath: string, legacyInput: boolean } {
  const userDataPath = app.getPath('userData')
  if (isAbsolute(inputPath)) {
    return { absolutePath: resolve(inputPath), legacyInput: true }
  }

  if (hasWindowsAbsoluteForm(inputPath)) {
    throw new WorkspacePathError(
      'PATH_ABSOLUTE_REJECTED',
      'The absolute path uses a platform form that cannot map to this workspace',
      inputPath
    )
  }

  const normalized = inputPath.replace(/\\/g, '/')
  const clean = normalized.startsWith('./') ? normalized.slice(2) : normalized
  if (clean.startsWith('workspaces/')) {
    return { absolutePath: resolve(join(userDataPath, clean)), legacyInput: true }
  }

  return { absolutePath: resolve(workspaceRoot, clean), legacyInput: false }
}

export function resolveWorkspacePath(
  inputPath: string,
  options: ResolveWorkspacePathOptions
): ResolvedWorkspacePath {
  validateLexicalInput(inputPath)

  const workspaceRoot = resolveWorkspaceRoot(options.chatUuid, options.workspaceRootOverride)
  const hasAbsoluteForm = isAbsolute(inputPath) || hasWindowsAbsoluteForm(inputPath)
  if (options.mode === 'embedded-relative' && hasAbsoluteForm) {
    throw new WorkspacePathError(
      'PATH_ABSOLUTE_REJECTED',
      'Embedded file tools require a workspace-relative path',
      inputPath
    )
  }

  const resolved = options.mode === 'legacy-compatible'
    ? resolveLegacyInput(inputPath, workspaceRoot)
    : { absolutePath: resolve(workspaceRoot, inputPath.replace(/\\/g, '/')), legacyInput: false }

  try {
    const canonicalWorkspaceRoot = canonicalizeThroughExistingPrefix(workspaceRoot)
    const canonicalPath = canonicalizeThroughExistingPrefix(resolved.absolutePath)
    if (!isPathWithin(canonicalPath, canonicalWorkspaceRoot)) {
      throw new WorkspacePathError(
        'PATH_SYMLINK_ESCAPE',
        'Resolved path must stay inside the workspace',
        inputPath
      )
    }

    return {
      absolutePath: resolved.absolutePath,
      relativePath: relative(canonicalWorkspaceRoot, canonicalPath).replace(/\\/g, '/') || '.',
      workspaceRoot,
      canonicalWorkspaceRoot,
      canonicalPath,
      intent: options.intent,
      legacyInput: resolved.legacyInput
    }
  } catch (error) {
    if (error instanceof WorkspacePathError) throw error
    throw new WorkspacePathError(
      'PATH_CANONICALIZATION_FAILED',
      'Unable to canonicalize path inside the workspace',
      inputPath
    )
  }
}

export function resolveWorkspaceRelativePath(
  absolutePath: string,
  options: Pick<ResolveWorkspacePathOptions, 'chatUuid' | 'workspaceRootOverride'>
): string {
  return resolveWorkspacePath(absolutePath, {
    ...options,
    mode: 'legacy-compatible',
    intent: 'existing'
  }).relativePath
}
