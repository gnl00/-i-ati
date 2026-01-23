import { app } from 'electron'
import { readFile, writeFile, mkdir, copyFile, readdir, stat, rename } from 'fs/promises'
import { dirname, join, basename, isAbsolute, relative, resolve } from 'path'
import { existsSync, statSync, accessSync, constants } from 'fs'
import { lookup } from 'mime-types'
import DatabaseService from '@main/services/DatabaseService'
import type {
  ReadTextFileArgs,
  ReadTextFileResponse,
  ReadMediaFileArgs,
  ReadMediaFileResponse,
  ReadMultipleFilesArgs,
  ReadMultipleFilesResponse,
  FileContent,
  WriteFileArgs,
  WriteFileResponse,
  EditFileArgs,
  EditFileResponse,
  SearchFileArgs,
  SearchFileResponse,
  SearchMatch,
  ListDirectoryArgs,
  ListDirectoryResponse,
  DirectoryEntry,
  ListDirectoryWithSizesArgs,
  ListDirectoryWithSizesResponse,
  DirectoryEntryWithSize,
  DirectoryTreeArgs,
  DirectoryTreeResponse,
  TreeNode,
  SearchFilesArgs,
  SearchFilesResponse,
  FileSearchMatch,
  GetFileInfoArgs,
  GetFileInfoResponse,
  FileInfo,
  ListAllowedDirectoriesArgs,
  ListAllowedDirectoriesResponse,
  CreateDirectoryArgs,
  CreateDirectoryResponse,
  MoveFileArgs,
  MoveFileResponse
} from '@tools/fileOperations/index.d'

// ============ Helper Functions ============

const DEFAULT_WORKSPACE_NAME = 'tmp'

function resolveWorkspaceBaseDir(chatUuid?: string): string {
  const userDataPath = app.getPath('userData')

  if (!chatUuid) {
    return join(userDataPath, 'workspaces', DEFAULT_WORKSPACE_NAME)
  }

  try {
    const workspacePath = DatabaseService.getWorkspacePathByUuid(chatUuid)
    if (workspacePath) {
      return workspacePath
    }
  } catch (error) {
    console.error('[FileOps] Failed to resolve workspace path from DB:', error)
  }

  return join(userDataPath, 'workspaces', chatUuid)
}

/**
 * Resolve file path with workspace support
 * Supports:
 * 1. Absolute paths (returned as-is, with a warning if outside baseDir)
 * 2. New format: relative path based on baseDir (e.g., "test.txt")
 * 3. Legacy format: workspace prefix included (e.g., "workspaces/123/test.txt")
 */
function resolveFilePath(relativePath: string, chatUuid?: string, baseDirOverride?: string): string {
  const userDataPath = app.getPath('userData')
  const baseDir = baseDirOverride ?? resolveWorkspaceBaseDir(chatUuid)

  // Allow absolute paths (used by custom workspace selection)
  if (isAbsolute(relativePath)) {
    const resolvedBase = resolve(baseDir)
    const target = resolve(relativePath)
    const rel = relative(resolvedBase, target)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      console.warn(`[FileOps] Absolute path outside workspace base: ${relativePath}`)
    }
    return target
  }

  // Detect legacy format: paths starting with "workspaces/" or "./workspaces/"
  if (relativePath.startsWith('workspaces/') || relativePath.startsWith('./workspaces/')) {
    console.log(`[FileOps] Legacy format detected: ${relativePath}`)
    const cleanPath = relativePath.startsWith('./') ? relativePath.slice(2) : relativePath
    return join(userDataPath, cleanPath)
  }

  // New format: resolve relative to baseDir
  const resolvedPath = join(baseDir, relativePath)
  console.log(`[FileOps] Resolved: ${relativePath} -> ${resolvedPath} (chatUuid: ${chatUuid ?? 'none'})`)
  return resolvedPath
}

// ============ Read Operations ============

/**
 * Read Text File Processor
 * 读取文本文件内容，支持指定行范围
 */
export async function processReadTextFile(args: ReadTextFileArgs): Promise<ReadTextFileResponse> {
  try {
    const { file_path, chat_uuid, encoding = 'utf-8', start_line, end_line } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    console.log(`[ReadTextFile] File exists check:`, existsSync(absolutePath))

    if (!existsSync(absolutePath)) {
      console.error(`[ReadTextFile] File not found at: ${absolutePath}`)
      return { success: false, error: `File not found: ${file_path}` }
    }

    const content = await readFile(absolutePath, encoding as BufferEncoding)
    const lines = content.split('\n')
    const totalLines = lines.length

    let resultContent = content
    if (start_line !== undefined || end_line !== undefined) {
      const start = Math.max(0, (start_line || 1) - 1)
      const end = end_line ? Math.min(totalLines, end_line) : totalLines
      resultContent = lines.slice(start, end).join('\n')
    }

    console.log(`[ReadTextFile] Successfully read ${totalLines} lines`)
    return { success: true, file_path, content: resultContent, lines: totalLines }
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
    const { file_path, chat_uuid } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    console.log(`[ReadMediaFile] Reading media file: ${file_path} -> ${absolutePath}`)

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    const buffer = await readFile(absolutePath)
    const base64Content = buffer.toString('base64')
    const mimeType = lookup(absolutePath) || 'application/octet-stream'
    const size = buffer.length

    console.log(`[ReadMediaFile] Successfully read ${size} bytes, MIME: ${mimeType}`)
    return { success: true, file_path, content: base64Content, mime_type: mimeType, size }
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
    const { file_paths, chat_uuid, encoding = 'utf-8' } = args
    console.log(`[ReadMultipleFiles] Reading ${file_paths.length} files`)
    const baseDir = resolveWorkspaceBaseDir(chat_uuid)

    const files: FileContent[] = await Promise.all(
      file_paths.map(async (file_path) => {
        try {
          const absolutePath = resolveFilePath(file_path, chat_uuid, baseDir)
          if (!existsSync(absolutePath)) {
            return { file_path, success: false, error: 'File not found' }
          }
          const content = await readFile(absolutePath, encoding as BufferEncoding)
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

// ============ Write Operations ============

/**
 * Write File Processor
 * 写入文件内容，支持自动创建目录和备份
 */
export async function processWriteFile(args: WriteFileArgs): Promise<WriteFileResponse> {
  try {
    const { file_path, chat_uuid, content, encoding = 'utf-8', create_dirs = true, backup = false } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    console.log(`[WriteFile] Writing to file: ${file_path} -> ${absolutePath}`)

    // 如果需要备份且文件存在，先备份
    if (backup && existsSync(absolutePath)) {
      const backupPath = `${absolutePath}.backup`
      await copyFile(absolutePath, backupPath)
      console.log(`[WriteFile] Created backup: ${backupPath}`)
    }

    // 如果需要创建目录
    if (create_dirs) {
      const dir = dirname(absolutePath)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
        console.log(`[WriteFile] Created directory: ${dir}`)
      }
    }

    // 写入文件
    await writeFile(absolutePath, content, encoding as BufferEncoding)
    const bytesWritten = Buffer.byteLength(content, encoding as BufferEncoding)

    console.log(`[WriteFile] Successfully wrote ${bytesWritten} bytes`)
    return { success: true, file_path, bytes_written: bytesWritten }
  } catch (error: any) {
    console.error('[WriteFile] Error:', error)
    return { success: false, error: error.message || 'Failed to write file' }
  }
}

/**
 * Edit File Processor
 * 编辑文件内容，支持字符串替换和正则替换
 */
export async function processEditFile(args: EditFileArgs): Promise<EditFileResponse> {
  try {
    const { file_path, chat_uuid, search, replace, regex = false, all = false } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    console.log(`[EditFile] Editing file: ${file_path} -> ${absolutePath}`)

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    const content = await readFile(absolutePath, 'utf-8')
    let newContent: string
    let replacements = 0

    if (regex) {
      const flags = all ? 'g' : ''
      const regexPattern = new RegExp(search, flags)
      newContent = content.replace(regexPattern, () => {
        replacements++
        return replace
      })
    } else {
      if (all) {
        const parts = content.split(search)
        replacements = parts.length - 1
        newContent = parts.join(replace)
      } else {
        const index = content.indexOf(search)
        if (index !== -1) {
          newContent = content.substring(0, index) + replace + content.substring(index + search.length)
          replacements = 1
        } else {
          newContent = content
        }
      }
    }

    if (replacements > 0) {
      await writeFile(absolutePath, newContent, 'utf-8')
      console.log(`[EditFile] Made ${replacements} replacement(s)`)
    } else {
      console.log(`[EditFile] No matches found`)
    }

    return { success: true, file_path, replacements }
  } catch (error: any) {
    console.error('[EditFile] Error:', error)
    return { success: false, error: error.message || 'Failed to edit file' }
  }
}

// ============ Search Operations ============

/**
 * Search File Processor
 * 在文件中搜索匹配的内容，支持正则表达式和大小写敏感
 */
export async function processSearchFile(args: SearchFileArgs): Promise<SearchFileResponse> {
  try {
    const { file_path, chat_uuid, pattern, regex = false, case_sensitive = true, max_results = 100 } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    console.log(`[SearchFile] Searching in file: ${file_path} -> ${absolutePath}`)

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    const content = await readFile(absolutePath, 'utf-8')
    const lines = content.split('\n')
    const matches: SearchMatch[] = []

    let searchPattern: RegExp
    if (regex) {
      const flags = case_sensitive ? '' : 'i'
      searchPattern = new RegExp(pattern, flags)
    } else {
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const flags = case_sensitive ? 'g' : 'gi'
      searchPattern = new RegExp(escapedPattern, flags)
    }

    for (let i = 0; i < lines.length && matches.length < max_results; i++) {
      const line = lines[i]
      const lineMatches = line.matchAll(searchPattern)

      for (const match of lineMatches) {
        if (matches.length >= max_results) break
        matches.push({
          line: i + 1,
          content: line,
          column: match.index !== undefined ? match.index + 1 : 0
        })
      }
    }

    console.log(`[SearchFile] Found ${matches.length} match(es)`)
    return { success: true, file_path, matches, total_matches: matches.length }
  } catch (error: any) {
    console.error('[SearchFile] Error:', error)
    return { success: false, error: error.message || 'Failed to search file' }
  }
}

/**
 * Search Files Processor
 * 在多个文件中搜索匹配的内容
 */
export async function processSearchFiles(args: SearchFilesArgs): Promise<SearchFilesResponse> {
  try {
    const { directory_path, chat_uuid, pattern, regex = false, case_sensitive = true, max_results = 100, file_pattern } = args
    const absoluteDirPath = resolveFilePath(directory_path, chat_uuid)
    console.log(`[SearchFiles] Searching in directory: ${directory_path} -> ${absoluteDirPath}`)

    if (!existsSync(absoluteDirPath)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const matches: FileSearchMatch[] = []
    let filesSearched = 0

    const searchInDirectory = async (dirPath: string) => {
      if (matches.length >= max_results) return

      const items = await readdir(dirPath)
      for (const item of items) {
        if (matches.length >= max_results) break

        const itemPath = join(dirPath, item)
        try {
          const stats = await stat(itemPath)

          if (stats.isDirectory()) {
            await searchInDirectory(itemPath)
          } else if (stats.isFile()) {
            // Check file pattern if specified
            if (file_pattern) {
              const fileRegex = new RegExp(file_pattern)
              if (!fileRegex.test(item)) continue
            }

            filesSearched++
            const content = await readFile(itemPath, 'utf-8')
            const lines = content.split('\n')

            let searchPattern: RegExp
            if (regex) {
              const flags = case_sensitive ? '' : 'i'
              searchPattern = new RegExp(pattern, flags)
            } else {
              const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const flags = case_sensitive ? 'g' : 'gi'
              searchPattern = new RegExp(escapedPattern, flags)
            }

            for (let i = 0; i < lines.length && matches.length < max_results; i++) {
              const line = lines[i]
              const lineMatches = line.matchAll(searchPattern)

              for (const match of lineMatches) {
                if (matches.length >= max_results) break
                matches.push({
                  file_path: itemPath,
                  line: i + 1,
                  content: line,
                  column: match.index !== undefined ? match.index + 1 : 0
                })
              }
            }
          }
        } catch (error) {
          continue
        }
      }
    }

    await searchInDirectory(absoluteDirPath)

    console.log(`[SearchFiles] Found ${matches.length} match(es) in ${filesSearched} files`)
    return { success: true, directory_path, matches, total_matches: matches.length, files_searched: filesSearched }
  } catch (error: any) {
    console.error('[SearchFiles] Error:', error)
    return { success: false, error: error.message || 'Failed to search files' }
  }
}

// ============ Directory Operations ============

/**
 * List Directory Processor
 * 列出目录内容
 */
export async function processListDirectory(args: ListDirectoryArgs): Promise<ListDirectoryResponse> {
  try {
    const { directory_path, chat_uuid } = args
    const absolutePath = resolveFilePath(directory_path, chat_uuid)
    console.log(`[ListDirectory] Listing directory: ${directory_path} -> ${absolutePath}`)

    if (!existsSync(absolutePath)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const items = await readdir(absolutePath)
    const entries: DirectoryEntry[] = []

    for (const item of items) {
      const itemPath = join(absolutePath, item)
      try {
        const stats = statSync(itemPath)
        const type = stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file'
        entries.push({ name: item, type, path: itemPath })
      } catch (error) {
        continue
      }
    }

    console.log(`[ListDirectory] Found ${entries.length} entries`)
    return { success: true, directory_path, entries, total_count: entries.length }
  } catch (error: any) {
    console.error('[ListDirectory] Error:', error)
    return { success: false, error: error.message || 'Failed to list directory' }
  }
}

/**
 * List Directory With Sizes Processor
 * 列出目录内容，包含文件大小和修改时间
 */
export async function processListDirectoryWithSizes(args: ListDirectoryWithSizesArgs): Promise<ListDirectoryWithSizesResponse> {
  try {
    const { directory_path, chat_uuid } = args
    const absolutePath = resolveFilePath(directory_path, chat_uuid)
    console.log(`[ListDirectoryWithSizes] Listing: ${directory_path} -> ${absolutePath}`)

    if (!existsSync(absolutePath)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const items = await readdir(absolutePath)
    const entries: DirectoryEntryWithSize[] = []

    for (const item of items) {
      const itemPath = join(absolutePath, item)
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
    return { success: true, directory_path, entries, total_count: entries.length }
  } catch (error: any) {
    console.error('[ListDirectoryWithSizes] Error:', error)
    return { success: false, error: error.message || 'Failed to list directory' }
  }
}

/**
 * Directory Tree Processor
 * 递归列出目录树结构
 */
export async function processDirectoryTree(args: DirectoryTreeArgs): Promise<DirectoryTreeResponse> {
  try {
    const { directory_path, chat_uuid, max_depth = 3 } = args
    const absolutePath = resolveFilePath(directory_path, chat_uuid)
    const userDataPath = app.getPath('userData')
    console.log(`[DirectoryTree] Building tree for: ${directory_path} -> ${absolutePath}`)

    if (!existsSync(absolutePath)) {
      return { success: false, error: `Directory not found: ${directory_path}` }
    }

    const buildTree = async (dirPath: string, depth: number): Promise<TreeNode> => {
      const stats = await stat(dirPath)
      const name = basename(dirPath)

      // Convert absolute path back to relative path (relative to userData)
      const relativePath = dirPath.startsWith(userDataPath)
        ? dirPath.slice(userDataPath.length + 1).replace(/\\/g, '/')
        : dirPath

      if (!stats.isDirectory() || depth >= max_depth) {
        return { name, type: 'file', path: relativePath }
      }

      const items = await readdir(dirPath)
      const children: TreeNode[] = []

      for (const item of items) {
        const itemPath = join(dirPath, item)
        try {
          const childNode = await buildTree(itemPath, depth + 1)
          children.push(childNode)
        } catch (error) {
          continue
        }
      }

      return { name, type: 'directory', path: relativePath, children }
    }

    const tree = await buildTree(absolutePath, 0)
    console.log(`[DirectoryTree] Successfully built tree`)
    return { success: true, directory_path, tree }
  } catch (error: any) {
    console.error('[DirectoryTree] Error:', error)
    return { success: false, error: error.message || 'Failed to build directory tree' }
  }
}

// ============ File Info Operations ============

/**
 * Get File Info Processor
 * 获取文件详细信息
 */
export async function processGetFileInfo(args: GetFileInfoArgs): Promise<GetFileInfoResponse> {
  try {
    const { file_path, chat_uuid } = args
    const absolutePath = resolveFilePath(file_path, chat_uuid)
    console.log(`[GetFileInfo] Getting info for: ${file_path} -> ${absolutePath}`)

    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${file_path}` }
    }

    const stats = await stat(absolutePath)
    const type = stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file'

    let isReadable = false
    let isWritable = false
    try {
      accessSync(absolutePath, constants.R_OK)
      isReadable = true
    } catch { }
    try {
      accessSync(absolutePath, constants.W_OK)
      isWritable = true
    } catch { }

    const info: FileInfo = {
      path: file_path,
      name: basename(absolutePath),
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
 * List Allowed Directories Processor
 * 列出允许访问的目录
 */
export async function processListAllowedDirectories(_args: ListAllowedDirectoriesArgs): Promise<ListAllowedDirectoriesResponse> {
  try {
    console.log(`[ListAllowedDirectories] Listing allowed directories`)

    // TODO: Implement actual allowed directories logic
    // For now, return common directories
    const directories = [
      process.cwd(),
      process.env.HOME || process.env.USERPROFILE || '/'
    ]

    return { success: true, directories }
  } catch (error: any) {
    console.error('[ListAllowedDirectories] Error:', error)
    return { success: false, error: error.message || 'Failed to list allowed directories' }
  }
}

// ============ File Management Operations ============

/**
 * Create Directory Processor
 * 创建目录
 */
export async function processCreateDirectory(args: CreateDirectoryArgs): Promise<CreateDirectoryResponse> {
  try {
    const { directory_path, chat_uuid, recursive = true } = args
    const absolutePath = resolveFilePath(directory_path, chat_uuid)
    console.log(`[CreateDirectory] Creating: ${directory_path} -> ${absolutePath}`)

    if (existsSync(absolutePath)) {
      console.log(`[CreateDirectory] Directory already exists`)
      return { success: true, directory_path, created: false }
    }

    await mkdir(absolutePath, { recursive })

    console.log(`[CreateDirectory] Successfully created`)

    return { success: true, directory_path, created: true }
  } catch (error: any) {
    console.error('[CreateDirectory] Error:', error)
    return { success: false, error: error.message || 'Failed to create directory' }
  }
}

/**
 * Move File Processor
 * 移动或重命名文件
 */
export async function processMoveFile(args: MoveFileArgs): Promise<MoveFileResponse> {
  try {
    const { source_path, destination_path, chat_uuid, overwrite = false } = args
    const absoluteSourcePath = resolveFilePath(source_path, chat_uuid)
    const absoluteDestPath = resolveFilePath(destination_path, chat_uuid)
    console.log(`[MoveFile] Moving: ${source_path} -> ${destination_path}`)
    console.log(`[MoveFile] Absolute: ${absoluteSourcePath} -> ${absoluteDestPath}`)

    if (!existsSync(absoluteSourcePath)) {
      return { success: false, error: `Source file not found: ${source_path}` }
    }

    if (existsSync(absoluteDestPath) && !overwrite) {
      return { success: false, error: `Destination already exists: ${destination_path}` }
    }

    await rename(absoluteSourcePath, absoluteDestPath)
    console.log(`[MoveFile] Successfully moved`)
    return { success: true, source_path, destination_path }
  } catch (error: any) {
    console.error('[MoveFile] Error:', error)
    return { success: false, error: error.message || 'Failed to move file' }
  }
}
