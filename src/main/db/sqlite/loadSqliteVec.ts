import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import type { ScopedLogger } from '@main/logging/LogService'

function resolveUnpackedPath(loadablePath: string): string {
  const asarSegment = `${path.sep}app.asar${path.sep}`
  const unpackedSegment = `${path.sep}app.asar.unpacked${path.sep}`

  if (!loadablePath.includes(asarSegment)) {
    return loadablePath
  }

  return loadablePath.replace(asarSegment, unpackedSegment)
}

export function resolveSqliteVecLoadablePath(): { loadablePath: string; originalPath: string } {
  const originalPath = sqliteVec.getLoadablePath()

  if (!app.isPackaged) {
    return { loadablePath: originalPath, originalPath }
  }

  const unpackedPath = resolveUnpackedPath(originalPath)
  if (unpackedPath !== originalPath && fs.existsSync(unpackedPath)) {
    return { loadablePath: unpackedPath, originalPath }
  }

  return { loadablePath: originalPath, originalPath }
}

export function loadSqliteVecExtension(db: Database.Database, logger?: ScopedLogger): void {
  const { loadablePath, originalPath } = resolveSqliteVecLoadablePath()

  logger?.info('sqlite_vec.load_path_resolved', {
    packaged: app.isPackaged,
    originalPath,
    loadablePath
  })

  db.loadExtension(loadablePath)
}
