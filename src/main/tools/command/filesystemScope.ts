import type { FilesystemScope } from '@tools/command/index.d'

export interface CommandFilesystemScopeAssessment {
  declaredScope: FilesystemScope
  inferredScope: FilesystemScope
  requiresConfirmation: boolean
  reason: string
  declaredReason?: string
}

const OUTSIDE_PATH_PATTERNS = [
  { pattern: /(^|[\s"'=:(])~(?=$|[\/\s"'():;|&<>])/u, reason: 'Command references the home directory with ~.' },
  { pattern: /\$(HOME|USERPROFILE)\b|\$\{(HOME|USERPROFILE)\}/u, reason: 'Command references a home directory environment variable.' },
  { pattern: /(^|[\s"'=:(])\/(Users|home|etc|var|private|Library)\b/u, reason: 'Command references an absolute path outside the workspace.' },
  { pattern: /(^|[\s"'=:(])\.\.(?=$|[\/\s"'():;|&<>])/u, reason: 'Command references a parent directory path.' },
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

function buildReason(
  declaredScope: FilesystemScope,
  inferredScope: FilesystemScope,
  inferredReason?: string,
  declaredReason?: string
): string {
  if (inferredScope !== 'workspace') {
    return inferredReason || 'Command may access files outside the workspace.'
  }

  if (declaredScope === 'outside_workspace') {
    return declaredReason?.trim() || 'The command was declared as accessing files outside the workspace.'
  }

  if (declaredScope === 'unknown') {
    return declaredReason?.trim() || 'The command filesystem boundary is unknown.'
  }

  return declaredReason?.trim() || 'Command is declared and inferred to stay inside the workspace.'
}

export function assessCommandFilesystemScope(args: {
  command: string
  filesystem_scope?: unknown
  filesystem_scope_reason?: unknown
}): CommandFilesystemScopeAssessment {
  const declaredScope = normalizeDeclaredScope(args.filesystem_scope)
  const declaredReason = typeof args.filesystem_scope_reason === 'string'
    ? args.filesystem_scope_reason.trim()
    : undefined
  const inferred = inferFilesystemScope(args.command)
  const requiresConfirmation = declaredScope !== 'workspace' || inferred.scope !== 'workspace'
  const reason = buildReason(declaredScope, inferred.scope, inferred.reason, declaredReason)

  return {
    declaredScope,
    inferredScope: inferred.scope,
    requiresConfirmation,
    reason,
    declaredReason
  }
}
