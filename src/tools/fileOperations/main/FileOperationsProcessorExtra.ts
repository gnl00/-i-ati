import { readdir, stat, mkdir as mkdirAsync, rename } from 'fs/promises'
import { existsSync, accessSync, constants } from 'fs'
import { join, basename } from 'path'
import type {
  ListDirectoryWithSizesArgs,
  ListDirectoryWithSizesResponse,
  DirectoryEntryWithSize,
  GetFileInfoArgs,
  GetFileInfoResponse,
  FileInfo,
  CreateDirectoryArgs,
  CreateDirectoryResponse,
  MoveFileArgs,
  MoveFileResponse
} from '../index'

/**
 * List Directory With Sizes Processor
 */
export async function processListDirectoryWithSizes(args: ListDirectoryWithSizesArgs): Promise<ListDirectoryWithSizesResponse> {
  try {
    const { directory_path } = args
    console.log(`[ListDirectoryWithSizes] Listing: ${directory_path}`)

    if (!existsSync(directory_path)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const items = await readdir(directory_path)
    const entries: DirectoryEntryWithSize[] = []

    for (const item of items) {
      const itemPath = join(directory_path, item)
      try {
        const stats = await stat(itemPath)
        const type = stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file'
        entries.push({
          name: item,
          type,
          path: itemPath,
          size: stats.size,
          modified: stats.mtime.toISOString()
        })
      } catch (error) {
        continue
      }
    }

    console.log(`[ListDirectoryWithSizes] Found ${entries.length} entries`)
    return { success: true, entries, total_count: entries.length }
  } catch (error: any) {
    console.error('[ListDirectoryWithSizes] Error:', error)
    return { success: false, error: error.message || 'Failed to list directory' }
  }
}

/**
 * Get File Info Processor
 */
export async function processGetFileInfo(args: GetFileInfoArgs): Promise<GetFileInfoResponse> {
  try {
    const { file_path } = args
    console.log(`[GetFileInfo] Getting info for: ${file_path}`)

    if (!existsSync(file_path)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    const stats = await stat(file_path)
    const type = stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file'

    let isReadable = false
    let isWritable = false
    try {
      accessSync(file_path, constants.R_OK)
      isReadable = true
    } catch {}
    try {
      accessSync(file_path, constants.W_OK)
      isWritable = true
    } catch {}

    const info: FileInfo = {
      path: file_path,
      name: basename(file_path),
      type,
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      permissions: stats.mode.toString(8).slice(-3),
      is_readable: isReadable,
      is_writable: isWritable
    }

    console.log(`[GetFileInfo] Successfully retrieved info`)
    return { success: true, info }
  } catch (error: any) {
    console.error('[GetFileInfo] Error:', error)
    return { success: false, error: error.message || 'Failed to get file info' }
  }
}

/**
 * Create Directory Processor
 */
export async function processCreateDirectory(args: CreateDirectoryArgs): Promise<CreateDirectoryResponse> {
  try {
    const { directory_path, recursive = true } = args
    console.log(`[CreateDirectory] Creating: ${directory_path}`)

    if (existsSync(directory_path)) {
      console.log(`[CreateDirectory] Directory already exists`)
      return { success: true, created: false }
    }

    await mkdirAsync(directory_path, { recursive })
    console.log(`[CreateDirectory] Successfully created`)
    return { success: true, created: true }
  } catch (error: any) {
    console.error('[CreateDirectory] Error:', error)
    return { success: false, error: error.message || 'Failed to create directory' }
  }
}

/**
 * Move File Processor
 */
export async function processMoveFile(args: MoveFileArgs): Promise<MoveFileResponse> {
  try {
    const { source_path, destination_path, overwrite = false } = args
    console.log(`[MoveFile] Moving: ${source_path} -> ${destination_path}`)

    if (!existsSync(source_path)) {
      return { success: false, error: `Source file not found: ${source_path}` }
    }

    if (existsSync(destination_path) && !overwrite) {
      return { success: false, error: `Destination already exists: ${destination_path}` }
    }

    await rename(source_path, destination_path)
    console.log(`[MoveFile] Successfully moved`)
    return { success: true }
  } catch (error: any) {
    console.error('[MoveFile] Error:', error)
    return { success: false, error: error.message || 'Failed to move file' }
  }
}
