import type { FilesystemScope } from '@tools/command/index.d'
import {
  canonicalizeThroughExistingPrefix,
  isPathWithin
} from '@main/services/filesystem/WorkspacePathBoundary'
import { isAbsolute, resolve } from 'path'

export interface CommandFilesystemScopeAssessment {
  declaredScope: FilesystemScope
  inferredScope: FilesystemScope
  requiresConfirmation: boolean
  reason: string
  declaredReason?: string
  cwdScope: FilesystemScope
  cwdReason?: string
  sensitiveEnvironmentVariables: string[]
}

const EXECUTION_AFFECTING_ENVIRONMENT_VARIABLES = new Set([
  'BASH_ENV',
  'CLASSPATH',
  'ENV',
  'GIT_EXEC_PATH',
  'JAVA_TOOL_OPTIONS',
  'JDK_JAVA_OPTIONS',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PATH',
  'PATHEXT',
  'PERL5LIB',
  'PERL5OPT',
  'PYTHONHOME',
  'PYTHONPATH',
  'RUBYLIB',
  'RUBYOPT',
  'ZDOTDIR'
])

const EXECUTION_AFFECTING_ENVIRONMENT_PREFIXES = [
  'DYLD_'
] as const

const OUTSIDE_PATH_PATTERNS = [
  { pattern: /(^|[\s"'=:(])~(?=$|[/\s"'():;|&<>])/u, reason: 'Command references the home directory with ~.' },
  { pattern: /\$(HOME|USERPROFILE)\b|\$\{(HOME|USERPROFILE)\}/u, reason: 'Command references a home directory environment variable.' },
  { pattern: /(^|[\s"'=:(])\/(Users|home|etc|var|private|Library)\b/u, reason: 'Command references an absolute path outside the workspace.' },
  { pattern: /(^|[\s"'=:(])\.\.(?=$|[/\s"'():;|&<>])/u, reason: 'Command references a parent directory path.' },
  { pattern: /(^|[\s])source\s+~\//u, reason: 'Command sources a file from the home directory.' },
  { pattern: /(^|[\s])\.\s+~\//u, reason: 'Command sources a file from the home directory.' },
  { pattern: />>?\s*(~|\$(HOME|USERPROFILE)\b|\$\{(HOME|USERPROFILE)\}|\/(Users|home|etc|var|private|Library)\b)/u, reason: 'Command redirects output to a path outside the workspace.' }
] as const

function normalizeDeclaredScope(scope: unknown): FilesystemScope {
  if (scope === 'workspace' || scope === 'outside_workspace' || scope === 'unknown') {
    return scope
  }
  return 'unknown'
}

function inferFilesystemScope(command: string): { scope: FilesystemScope; reason?: string } {
  const trimmed = command.trim()
  if (!trimmed) {
    return { scope: 'unknown', reason: 'Command is empty, so filesystem access cannot be determined.' }
  }

  for (const { pattern, reason } of OUTSIDE_PATH_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { scope: 'outside_workspace', reason }
    }
  }

  return { scope: 'workspace' }
}

function assessWorkingDirectory(
  cwd: unknown,
  workspaceRoot: string | undefined
): { scope: FilesystemScope; reason?: string } {
  if (cwd === undefined || cwd === '') {
    return { scope: 'workspace' }
  }

  if (typeof cwd !== 'string' || cwd.includes('\0')) {
    return {
      scope: 'unknown',
      reason: 'The working directory cannot be safely resolved against the workspace.'
    }
  }

  if (!workspaceRoot || !isAbsolute(workspaceRoot)) {
    return {
      scope: 'unknown',
      reason: `Working directory "${cwd}" cannot be checked because the workspace root is unavailable.`
    }
  }

  try {
    const hasParentSegment = cwd.split(/[\\/]+/).some(segment => segment === '..')
    const hasWindowsAbsoluteForm = /^[a-zA-Z]:/.test(cwd) || /^[/\\]{2}/.test(cwd) || /^\\/.test(cwd)
    if (hasParentSegment || (hasWindowsAbsoluteForm && !isAbsolute(cwd))) {
      return {
        scope: 'outside_workspace',
        reason: `Working directory "${cwd}" resolves outside the workspace boundary.`
      }
    }

    const canonicalWorkspaceRoot = canonicalizeThroughExistingPrefix(workspaceRoot)
    const requestedPath = isAbsolute(cwd) ? resolve(cwd) : resolve(workspaceRoot, cwd)
    const canonicalWorkingDirectory = canonicalizeThroughExistingPrefix(requestedPath)
    return isPathWithin(canonicalWorkingDirectory, canonicalWorkspaceRoot)
      ? { scope: 'workspace' }
      : {
          scope: 'outside_workspace',
          reason: `Working directory "${cwd}" resolves outside the workspace boundary.`
        }
  } catch {
    return {
      scope: 'unknown',
      reason: `Working directory "${cwd}" could not be canonicalized within the workspace.`
    }
  }
}

function findSensitiveEnvironmentVariables(env: unknown): string[] {
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return []
  }

  return Object.keys(env as Record<string, unknown>)
    .filter((key) => {
      const normalizedKey = key.toUpperCase()
      return EXECUTION_AFFECTING_ENVIRONMENT_VARIABLES.has(normalizedKey)
        || EXECUTION_AFFECTING_ENVIRONMENT_PREFIXES.some(prefix => normalizedKey.startsWith(prefix))
    })
    .sort((left, right) => left.localeCompare(right))
}

function buildReason(
  declaredScope: FilesystemScope,
  inferredScope: FilesystemScope,
  inferredReason?: string,
  declaredReason?: string,
  cwdReason?: string,
  sensitiveEnvironmentVariables: string[] = []
): string {
  const reasons: string[] = []
  if (inferredScope !== 'workspace' && inferredReason) {
    reasons.push(inferredReason)
  }
  if (declaredScope === 'outside_workspace') {
    reasons.push(declaredReason?.trim() || 'The command was declared as accessing files outside the workspace.')
  } else if (declaredScope === 'unknown') {
    reasons.push(declaredReason?.trim() || 'The command filesystem boundary is unknown.')
  } else if (declaredReason?.trim()) {
    reasons.push(declaredReason.trim())
  }
  if (cwdReason) reasons.push(cwdReason)
  if (sensitiveEnvironmentVariables.length > 0) {
    reasons.push(
      `Environment overrides can change executable or runtime loading: ${sensitiveEnvironmentVariables.join(', ')}.`
    )
  }

  const uniqueReasons = Array.from(new Set(reasons))
  if (uniqueReasons.length > 0) return uniqueReasons.join(' ')

  return 'Command is declared and inferred to stay inside the workspace.'
}

export function assessCommandFilesystemScope(args: {
  command: string
  filesystem_scope?: unknown
  filesystem_scope_reason?: unknown
  cwd?: unknown
  env?: unknown
  workspaceRoot?: string
}): CommandFilesystemScopeAssessment {
  const declaredScope = normalizeDeclaredScope(args.filesystem_scope)
  const declaredReason = typeof args.filesystem_scope_reason === 'string'
    ? args.filesystem_scope_reason.trim()
    : undefined
  const commandAssessment = inferFilesystemScope(args.command)
  const cwdAssessment = assessWorkingDirectory(args.cwd, args.workspaceRoot)
  const sensitiveEnvironmentVariables = findSensitiveEnvironmentVariables(args.env)
  const inferredScope = commandAssessment.scope === 'outside_workspace' || cwdAssessment.scope === 'outside_workspace'
    ? 'outside_workspace'
    : commandAssessment.scope === 'unknown'
      || cwdAssessment.scope === 'unknown'
      || sensitiveEnvironmentVariables.length > 0
      ? 'unknown'
      : 'workspace'
  const requiresConfirmation = declaredScope !== 'workspace' || inferredScope !== 'workspace'
  const reason = buildReason(
    declaredScope,
    inferredScope,
    commandAssessment.reason,
    declaredReason,
    cwdAssessment.reason,
    sensitiveEnvironmentVariables
  )

  return {
    declaredScope,
    inferredScope,
    requiresConfirmation,
    reason,
    declaredReason,
    cwdScope: cwdAssessment.scope,
    cwdReason: cwdAssessment.reason,
    sensitiveEnvironmentVariables
  }
}
