/**
 * File Operations Tool Types
 * 文件操作工具的类型定义
 */

// ============ Read Text File ============
export interface ReadTextFileArgs {
  file_path: string
  chat_uuid?: string
  encoding?: string
  start_line?: number
  end_line?: number
  around_line?: number
  window_size?: number
}

export interface ReadTextFileResponse {
  success: boolean
  file_path?: string
  content?: string
  lines?: number
  returned_start_line?: number
  returned_end_line?: number
  truncated?: boolean
  error?: string
}

// ============ Read Media File ============
export interface ReadMediaFileArgs {
  file_path: string
  chat_uuid?: string
}

export interface ReadMediaFileResponse {
  success: boolean
  file_path?: string
  content?: string  // Base64 encoded
  mime_type?: string
  size?: number
  error?: string
}

// ============ Read Multiple Files ============
export interface ReadMultipleFilesArgs {
  file_paths: string[]
  chat_uuid?: string
  encoding?: string
}

export interface FileContent {
  file_path: string
  success: boolean
  content?: string
  lines?: number
  error?: string
}

export interface ReadMultipleFilesResponse {
  success: boolean
  files?: FileContent[]
  total_files?: number
  error?: string
}

// ============ Write File ============
export interface WriteFileArgs {
  file_path: string
  chat_uuid?: string
  content: string
  encoding?: string
  create_dirs?: boolean
  backup?: boolean
}

export interface WriteFileResponse {
  success: boolean
  file_path?: string
  bytes_written?: number
  error?: string
}

// ============ Edit File ============
export interface EditFileArgs {
  file_path: string
  chat_uuid?: string
  search: string
  replace: string
  regex?: boolean
  all?: boolean
}

export interface EditFileResponse {
  success: boolean
  file_path?: string
  replacements?: number
  error?: string
}

// ============ Search File ============
export interface SearchFileArgs {
  file_path: string
  chat_uuid?: string
  pattern: string
  regex?: boolean
  case_sensitive?: boolean
  max_results?: number
}

export interface SearchMatch {
  line: number
  content: string
  column: number
}

export interface SearchFileResponse {
  success: boolean
  file_path?: string
  matches?: SearchMatch[]
  total_matches?: number
  error?: string
}

// ============ List Directory ============
export interface ListDirectoryArgs {
  directory_path: string
  chat_uuid?: string
}

export interface DirectoryEntry {
  name: string
  type: 'file' | 'directory' | 'symlink'
  path: string
}

export interface ListDirectoryResponse {
  success: boolean
  directory_path?: string
  entries?: DirectoryEntry[]
  total_count?: number
  error?: string
}

// ============ List Directory With Sizes ============
export interface ListDirectoryWithSizesArgs {
  directory_path: string
  chat_uuid?: string
}

export interface DirectoryEntryWithSize {
  name: string
  type: 'file' | 'directory' | 'symlink'
  path: string
  size?: number
  modified?: string
}

export interface ListDirectoryWithSizesResponse {
  success: boolean
  directory_path?: string
  entries?: DirectoryEntryWithSize[]
  total_count?: number
  error?: string
}

// ============ Directory Tree ============
export interface DirectoryTreeArgs {
  directory_path: string
  chat_uuid?: string
  max_depth?: number
}

export interface TreeNode {
  name: string
  type: 'file' | 'directory'
  path: string
  children?: TreeNode[]
}

export interface DirectoryTreeResponse {
  success: boolean
  directory_path?: string
  tree?: TreeNode
  error?: string
}

// ============ Search Files ============
export interface SearchFilesArgs {
  directory_path: string
  chat_uuid?: string
  pattern: string
  regex?: boolean
  case_sensitive?: boolean
  max_results?: number
  file_pattern?: string
}

export interface FileSearchMatch {
  file_path: string
  line: number
  content: string
  column: number
}

export interface SearchFilesResponse {
  success: boolean
  directory_path?: string
  matches?: FileSearchMatch[]
  total_matches?: number
  files_searched?: number
  error?: string
}

// ============ Get File Info ============
export interface GetFileInfoArgs {
  file_path: string
  chat_uuid?: string
}

export interface FileInfo {
  path: string
  name: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  created: string
  modified: string
  accessed: string
  permissions: string
  is_readable: boolean
  is_writable: boolean
}

export interface GetFileInfoResponse {
  success: boolean
  info?: FileInfo
  error?: string
}

// ============ List Allowed Directories ============
export interface ListAllowedDirectoriesArgs {
  // No parameters needed
}

export interface ListAllowedDirectoriesResponse {
  success: boolean
  directories?: string[]
  error?: string
}

// ============ Create Directory ============
export interface CreateDirectoryArgs {
  directory_path: string
  chat_uuid?: string
  recursive?: boolean
}

export interface CreateDirectoryResponse {
  success: boolean
  directory_path?: string
  created?: boolean
  error?: string
}

// ============ Move File ============
export interface MoveFileArgs {
  source_path: string
  destination_path: string
  chat_uuid?: string
  overwrite?: boolean
}

export interface MoveFileResponse {
  success: boolean
  source_path?: string
  destination_path?: string
  error?: string
}

// ============ Claude-style Aliases ============
export interface ReadArgs extends ReadTextFileArgs {}
export interface ReadResponse extends ReadTextFileResponse {}

export interface ReadMediaArgs extends ReadMediaFileArgs {}
export interface ReadMediaResponse extends ReadMediaFileResponse {}

export interface WriteArgs extends WriteFileArgs {}
export interface WriteResponse extends WriteFileResponse {}

export interface EditArgs extends EditFileArgs {}
export interface EditResponse extends EditFileResponse {}

export interface GrepArgs {
  path: string
  chat_uuid?: string
  pattern: string
  regex?: boolean
  case_sensitive?: boolean
  max_results?: number
  file_pattern?: string
}

export interface GrepResponse {
  success: boolean
  path?: string
  target_type?: 'file' | 'directory'
  matches?: FileSearchMatch[]
  total_matches?: number
  files_searched?: number
  error?: string
}

export interface LsArgs {
  path: string
  chat_uuid?: string
  details?: boolean
}

export interface LsEntry extends DirectoryEntryWithSize {}

export interface LsResponse {
  success: boolean
  path?: string
  entries?: LsEntry[]
  total_count?: number
  error?: string
}

export interface TreeArgs {
  path: string
  chat_uuid?: string
  max_depth?: number
}

export interface TreeResponse {
  success: boolean
  path?: string
  tree?: TreeNode
  error?: string
}

export interface GlobArgs {
  path: string
  chat_uuid?: string
  pattern: string
  max_results?: number
}

export interface GlobMatch {
  path: string
  name: string
  type: 'file' | 'directory'
}

export interface GlobResponse {
  success: boolean
  path?: string
  matches?: GlobMatch[]
  total_matches?: number
  error?: string
}

export interface StatArgs extends GetFileInfoArgs {}
export interface StatResponse extends GetFileInfoResponse {}

export interface MkdirArgs extends CreateDirectoryArgs {}
export interface MkdirResponse extends CreateDirectoryResponse {}

export interface MvArgs extends MoveFileArgs {}
export interface MvResponse extends MoveFileResponse {}
