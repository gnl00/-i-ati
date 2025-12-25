import { readFile, readdir } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { lookup } from 'mime-types'
import type {
  ReadTextFileArgs,
  ReadTextFileResponse,
  ReadMediaFileArgs,
  ReadMediaFileResponse,
  ReadMultipleFilesArgs,
  ReadMultipleFilesResponse,
  FileContent,
  ListDirectoryArgs,
  ListDirectoryResponse,
  DirectoryEntry
} from '../index'

/**
 * Read Text File Processor (renamed from read_file)
 */
export async function processReadTextFile(args: ReadTextFileArgs): Promise<ReadTextFileResponse> {
  try {
    const { file_path, encoding = 'utf-8', start_line, end_line } = args
    console.log(`[ReadTextFile] Reading file: ${file_path}`)

    if (!existsSync(file_path)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    const content = await readFile(file_path, encoding as BufferEncoding)
    const lines = content.split('\n')
    const totalLines = lines.length

    let resultContent = content
    if (start_line !== undefined || end_line !== undefined) {
      const start = Math.max(0, (start_line || 1) - 1)
      const end = end_line ? Math.min(totalLines, end_line) : totalLines
      resultContent = lines.slice(start, end).join('\n')
    }

    console.log(`[ReadTextFile] Successfully read ${totalLines} lines`)
    return { success: true, content: resultContent, lines: totalLines }
  } catch (error: any) {
    console.error('[ReadTextFile] Error:', error)
    return { success: false, error: error.message || 'Failed to read file' }
  }
}

/**
 * Read Media File Processor
 * 读取二进制文件并返回 Base64 编码
 */
export async function processReadMediaFile(args: ReadMediaFileArgs): Promise<ReadMediaFileResponse> {
  try {
    const { file_path } = args
    console.log(`[ReadMediaFile] Reading media file: ${file_path}`)

    if (!existsSync(file_path)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    const buffer = await readFile(file_path)
    const base64Content = buffer.toString('base64')
    const mimeType = lookup(file_path) || 'application/octet-stream'
    const size = buffer.length

    console.log(`[ReadMediaFile] Successfully read ${size} bytes, MIME: ${mimeType}`)
    return { success: true, content: base64Content, mime_type: mimeType, size }
  } catch (error: any) {
    console.error('[ReadMediaFile] Error:', error)
    return { success: false, error: error.message || 'Failed to read media file' }
  }
}

/**
 * Read Multiple Files Processor
 * 批量读取多个文件
 */
export async function processReadMultipleFiles(args: ReadMultipleFilesArgs): Promise<ReadMultipleFilesResponse> {
  try {
    const { file_paths, encoding = 'utf-8' } = args
    console.log(`[ReadMultipleFiles] Reading ${file_paths.length} files`)

    const files: FileContent[] = await Promise.all(
      file_paths.map(async (file_path) => {
        try {
          if (!existsSync(file_path)) {
            return { file_path, success: false, error: 'File not found' }
          }
          const content = await readFile(file_path, encoding as BufferEncoding)
          const lines = content.split('\n').length
          return { file_path, success: true, content, lines }
        } catch (error: any) {
          return { file_path, success: false, error: error.message }
        }
      })
    )

    console.log(`[ReadMultipleFiles] Successfully processed ${files.length} files`)
    return { success: true, files, total_files: files.length }
  } catch (error: any) {
    console.error('[ReadMultipleFiles] Error:', error)
    return { success: false, error: error.message || 'Failed to read multiple files' }
  }
}

/**
 * List Directory Processor
 * 列出目录内容
 */
export async function processListDirectory(args: ListDirectoryArgs): Promise<ListDirectoryResponse> {
  try {
    const { directory_path } = args
    console.log(`[ListDirectory] Listing directory: ${directory_path}`)

    if (!existsSync(directory_path)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const items = await readdir(directory_path)
    const entries: DirectoryEntry[] = []

    for (const item of items) {
      const itemPath = join(directory_path, item)
      try {
        const stats = statSync(itemPath)
        const type = stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file'
        entries.push({ name: item, type, path: itemPath })
      } catch (error) {
        // Skip items that can't be accessed
        continue
      }
    }

    console.log(`[ListDirectory] Found ${entries.length} entries`)
    return { success: true, entries, total_count: entries.length }
  } catch (error: any) {
    console.error('[ListDirectory] Error:', error)
    return { success: false, error: error.message || 'Failed to list directory' }
  }
}
