/**
 * File Operations Tool Types
 * 文件操作工具的类型定义
 */

import type { ToolFailure } from '../toolFailure'

export interface ToolFailureResponse {
  failure?: ToolFailure
}

// ============ Read Text File ============
export interface ReadTextFileArgs {
  file_path: string
  chat_uuid?: string
  encoding?: string
  start_line?: number
  start_column?: number
  end_line?: number
  around_line?: number
  window_size?: number
}

export interface ReadTextFileResponse extends ToolFailureResponse {
  success: boolean
  file_path?: string
  content?: string
  lines?: number
  returned_start_line?: number
  returned_end_line?: number
  returned_start_column?: number
  returned_end_column?: number
  next_start_line?: number
  next_start_column?: number
  truncated?: boolean
  error?: string
}

// ============ Read Multiple Files ============
export interface ReadMultipleFilesArgs {
  file_paths: string[]
  chat_uuid?: string
  encoding?: string
}

export interface FileContent extends ToolFailureResponse {
  file_path: string
  success: boolean
  content?: string
  lines?: number
  error?: string
}

export interface ReadMultipleFilesResponse extends ToolFailureResponse {
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

export interface WriteFileResponse extends ToolFailureResponse {
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
  dry_run?: boolean
  expected_replacements?: number
  start_line?: number
  end_line?: number
  max_diagnostics?: number
}

export interface EditMatchLocation {
  line: number
  column: number
  preview: string
}

export interface EditCharacterDifference {
  index: number
  expected: string
  expected_codepoint: string
  actual: string
  actual_codepoint: string
}

export interface EditNearestMatch {
  line: number
  column: number
  score: number
  content: string
  normalized_match?: 'nfkc' | 'dash_equivalent' | 'whitespace_flexible'
  differences?: EditCharacterDifference[]
}

export interface EditDiagnostics {
  message: string
  matches?: EditMatchLocation[]
  nearest_matches?: EditNearestMatch[]
}

export interface EditFileResponse extends ToolFailureResponse {
  success: boolean
  file_path?: string
  status?: 'replaced' | 'dry_run' | 'no_match' | 'multiple_matches' | 'match_count_mismatch'
  replacements?: number
  diagnostics?: EditDiagnostics
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

export interface SearchFileResponse extends ToolFailureResponse {
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

export interface ListDirectoryResponse extends ToolFailureResponse {
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

export interface ListDirectoryWithSizesResponse extends ToolFailureResponse {
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
  type: 'file' | 'directory' | 'symlink'
  path: string
  children?: TreeNode[]
}

export interface DirectoryTreeResponse extends ToolFailureResponse {
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

export interface SearchFilesResponse extends ToolFailureResponse {
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

export interface GetFileInfoResponse extends ToolFailureResponse {
  success: boolean
  info?: FileInfo
  error?: string
}

// ============ List Allowed Directories ============
export interface ListAllowedDirectoriesArgs {
  chat_uuid?: string
}

export interface ListAllowedDirectoriesResponse extends ToolFailureResponse {
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

export interface CreateDirectoryResponse extends ToolFailureResponse {
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

export interface MoveFileResponse extends ToolFailureResponse {
  success: boolean
  source_path?: string
  destination_path?: string
  error?: string
}

// ============ Claude-style Aliases ============
export interface ReadArgs extends ReadTextFileArgs {}
export interface ReadResponse extends ReadTextFileResponse {}

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

export interface GrepResponse extends ToolFailureResponse {
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

export interface LsResponse extends ToolFailureResponse {
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

export interface TreeResponse extends ToolFailureResponse {
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
  type: 'file' | 'directory' | 'symlink'
}

export interface GlobResponse extends ToolFailureResponse {
  success: boolean
  path?: string
  matches?: GlobMatch[]
  total_matches?: number
  error?: string
}

export interface StatArgs {
  path: string
  chat_uuid?: string
}
export interface StatResponse extends GetFileInfoResponse {}

export interface MkdirArgs extends CreateDirectoryArgs {}
export interface MkdirResponse extends CreateDirectoryResponse {}

export interface MvArgs extends MoveFileArgs {}
export interface MvResponse extends MoveFileResponse {}
