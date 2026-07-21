import path from 'path'
import * as fs from 'fs/promises'
import { isPathWithin } from '@main/services/filesystem/WorkspacePathBoundary'

export type SkillPathErrorCode =
  | 'INVALID_PATH'
  | 'PATH_TRAVERSAL'
  | 'PATH_NOT_FOUND'
  | 'PATH_CANONICALIZATION_FAILED'
  | 'PATH_SYMLINK_ESCAPE'

export class SkillPathError extends Error {
  constructor(
    message: string,
    readonly code: SkillPathErrorCode
  ) {
    super(message)
    this.name = 'SkillPathError'
  }
}

export interface ResolvedSkillPath {
  skillRoot: string
  canonicalSkillRoot: string
  absolutePath: string
  canonicalPath: string
}

const isMissingPathError = (error: unknown): boolean => (
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && (error as NodeJS.ErrnoException).code === 'ENOENT'
)

export async function resolveSkillPath(
  skillRoot: string,
  relativePath: string,
  label = 'Path'
): Promise<ResolvedSkillPath> {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new SkillPathError(`${label} must be a relative path`, 'INVALID_PATH')
  }

  const absolutePath = path.resolve(skillRoot, relativePath)
  if (!isPathWithin(absolutePath, path.resolve(skillRoot))) {
    throw new SkillPathError(`${label} escapes skill directory: ${relativePath}`, 'PATH_TRAVERSAL')
  }

  const canonicalSkillRoot = await fs.realpath(skillRoot)

  let entryStats: Awaited<ReturnType<typeof fs.lstat>>
  try {
    entryStats = await fs.lstat(absolutePath)
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new SkillPathError(`${label} not found: ${relativePath}`, 'PATH_NOT_FOUND')
    }
    throw error
  }

  let canonicalPath: string
  try {
    canonicalPath = await fs.realpath(absolutePath)
  } catch (error) {
    if (entryStats.isSymbolicLink() && isMissingPathError(error)) {
      throw new SkillPathError(
        `${label} symlink target cannot be resolved: ${relativePath}`,
        'PATH_CANONICALIZATION_FAILED'
      )
    }
    throw error
  }

  if (!isPathWithin(canonicalPath, canonicalSkillRoot)) {
    throw new SkillPathError(
      `${label} symlink escapes skill directory: ${relativePath}`,
      'PATH_SYMLINK_ESCAPE'
    )
  }

  return {
    skillRoot,
    canonicalSkillRoot,
    absolutePath,
    canonicalPath
  }
}
