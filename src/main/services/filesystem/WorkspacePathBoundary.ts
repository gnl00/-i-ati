import { lstatSync, realpathSync } from 'fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'path'

export function isPathWithin(childPath: string, parentPath: string): boolean {
  const childRelativePath = relative(parentPath, childPath)
  return childRelativePath === '' || (
    Boolean(childRelativePath)
    && !childRelativePath.startsWith(`..${sep}`)
    && childRelativePath !== '..'
    && !isAbsolute(childRelativePath)
  )
}

export function canonicalizeThroughExistingPrefix(inputPath: string): string {
  const requestedPath = resolve(inputPath)
  let existingPrefix = requestedPath
  let prefixFound = false

  while (!prefixFound) {
    try {
      lstatSync(existingPrefix)
      prefixFound = true
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error
      }

      const parent = dirname(existingPrefix)
      if (parent === existingPrefix) {
        return requestedPath
      }
      existingPrefix = parent
    }
  }

  const unresolvedSuffix = relative(existingPrefix, requestedPath)
  return resolve(realpathSync(existingPrefix), unresolvedSuffix)
}
