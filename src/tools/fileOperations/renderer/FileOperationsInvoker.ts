import {
  FILE_READ_TEXT_ACTION,
  FILE_READ_MEDIA_ACTION,
  FILE_READ_MULTIPLE_ACTION,
  FILE_WRITE_ACTION,
  FILE_EDIT_ACTION,
  FILE_SEARCH_ACTION,
  FILE_LIST_DIR_ACTION,
  FILE_LIST_DIR_SIZES_ACTION,
  FILE_DIR_TREE_ACTION,
  FILE_SEARCH_FILES_ACTION,
  FILE_GET_INFO_ACTION,
  FILE_LIST_ALLOWED_DIRS_ACTION,
  FILE_CREATE_DIR_ACTION,
  FILE_MOVE_ACTION
} from '@constants/index'
import { useChatStore } from '@renderer/store'
import type {
  ReadTextFileArgs,
  ReadTextFileResponse,
  ReadMediaFileArgs,
  ReadMediaFileResponse,
  ReadMultipleFilesArgs,
  ReadMultipleFilesResponse,
  WriteFileArgs,
  WriteFileResponse,
  EditFileArgs,
  EditFileResponse,
  SearchFileArgs,
  SearchFileResponse,
  ListDirectoryArgs,
  ListDirectoryResponse,
  ListDirectoryWithSizesArgs,
  ListDirectoryWithSizesResponse,
  DirectoryTreeArgs,
  DirectoryTreeResponse,
  SearchFilesArgs,
  SearchFilesResponse,
  GetFileInfoArgs,
  GetFileInfoResponse,
  ListAllowedDirectoriesArgs,
  ListAllowedDirectoriesResponse,
  CreateDirectoryArgs,
  CreateDirectoryResponse,
  MoveFileArgs,
  MoveFileResponse
} from '../index'

/**
 * Helper function to get Electron IPC renderer
 */
function getElectronIPC() {
  const electron = (window as any).electron
  if (!electron?.ipcRenderer) {
    throw new Error('Electron IPC not available')
  }
  return electron.ipcRenderer
}

function withChatUuid<T extends { chat_uuid?: string }>(args: T): T {
  if (args.chat_uuid) return args
  const chatUuid = useChatStore.getState().currentChatUuid
  if (!chatUuid) return args
  return { ...args, chat_uuid: chatUuid }
}

// ============ Read Operations ============

/**
 * Read Text File Invoker
 */
export async function invokeReadTextFile(args: ReadTextFileArgs): Promise<ReadTextFileResponse> {
  const argsWithChat = withChatUuid(args)
  console.log('[ReadTextFileInvoker] Reading text file:', argsWithChat.file_path)
  try {
    const ipc = getElectronIPC()
    const response: ReadTextFileResponse = await ipc.invoke(FILE_READ_TEXT_ACTION, argsWithChat)
    console.log('[ReadTextFileInvoker] Response:', response.success ? 'success' : 'failed')
    return response
  } catch (error: any) {
    console.error('[ReadTextFileInvoker] Error:', error)
    return { success: false, error: error.message || 'Unknown error occurred' }
  }
}

/**
 * Read Media File Invoker
 */
export async function invokeReadMediaFile(args: ReadMediaFileArgs): Promise<ReadMediaFileResponse> {
  const argsWithChat = withChatUuid(args)
  console.log('[ReadMediaFileInvoker] Reading media file:', argsWithChat.file_path)
  try {
    const ipc = getElectronIPC()
    const response: ReadMediaFileResponse = await ipc.invoke(FILE_READ_MEDIA_ACTION, argsWithChat)
    console.log('[ReadMediaFileInvoker] Response:', response.success ? 'success' : 'failed')
    return response
  } catch (error: any) {
    console.error('[ReadMediaFileInvoker] Error:', error)
    return { success: false, error: error.message || 'Unknown error occurred' }
  }
}

/**
 * Read Multiple Files Invoker
 */
export async function invokeReadMultipleFiles(args: ReadMultipleFilesArgs): Promise<ReadMultipleFilesResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(FILE_READ_MULTIPLE_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

// ============ Write Operations ============

/**
 * Write File Invoker
 */
export async function invokeWriteFile(args: WriteFileArgs): Promise<WriteFileResponse> {
  const argsWithChat = withChatUuid(args)
  console.log('[WriteFileInvoker] Writing file:', argsWithChat.file_path)
  try {
    const ipc = getElectronIPC()
    const response: WriteFileResponse = await ipc.invoke(FILE_WRITE_ACTION, argsWithChat)
    console.log('[WriteFileInvoker] Response:', response.success ? 'success' : 'failed')
    return response
  } catch (error: any) {
    console.error('[WriteFileInvoker] Error:', error)
    return { success: false, error: error.message || 'Unknown error occurred' }
  }
}

/**
 * Edit File Invoker
 */
export async function invokeEditFile(args: EditFileArgs): Promise<EditFileResponse> {
  const argsWithChat = withChatUuid(args)
  console.log('[EditFileInvoker] Editing file:', argsWithChat.file_path)
  try {
    const ipc = getElectronIPC()
    const response: EditFileResponse = await ipc.invoke(FILE_EDIT_ACTION, argsWithChat)
    console.log('[EditFileInvoker] Response:', response.success ? 'success' : 'failed')
    return response
  } catch (error: any) {
    console.error('[EditFileInvoker] Error:', error)
    return { success: false, error: error.message || 'Unknown error occurred' }
  }
}

// ============ Search Operations ============

/**
 * Search File Invoker
 */
export async function invokeSearchFile(args: SearchFileArgs): Promise<SearchFileResponse> {
  const argsWithChat = withChatUuid(args)
  console.log('[SearchFileInvoker] Searching file:', argsWithChat.file_path)
  try {
    const ipc = getElectronIPC()
    const response: SearchFileResponse = await ipc.invoke(FILE_SEARCH_ACTION, argsWithChat)
    console.log('[SearchFileInvoker] Response:', response.success ? 'success' : 'failed')
    return response
  } catch (error: any) {
    console.error('[SearchFileInvoker] Error:', error)
    return { success: false, error: error.message || 'Unknown error occurred' }
  }
}

/**
 * Search Files Invoker
 */
export async function invokeSearchFiles(args: SearchFilesArgs): Promise<SearchFilesResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(FILE_SEARCH_FILES_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

// ============ Directory Operations ============

/**
 * List Directory Invoker
 */
export async function invokeListDirectory(args: ListDirectoryArgs): Promise<ListDirectoryResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(FILE_LIST_DIR_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * List Directory With Sizes Invoker
 */
export async function invokeListDirectoryWithSizes(args: ListDirectoryWithSizesArgs): Promise<ListDirectoryWithSizesResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(FILE_LIST_DIR_SIZES_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Directory Tree Invoker
 */
export async function invokeDirectoryTree(args: DirectoryTreeArgs): Promise<DirectoryTreeResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(FILE_DIR_TREE_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

// ============ File Info Operations ============

/**
 * Get File Info Invoker
 */
export async function invokeGetFileInfo(args: GetFileInfoArgs): Promise<GetFileInfoResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(FILE_GET_INFO_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * List Allowed Directories Invoker
 */
export async function invokeListAllowedDirectories(args: ListAllowedDirectoriesArgs): Promise<ListAllowedDirectoriesResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(FILE_LIST_ALLOWED_DIRS_ACTION, args)
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

// ============ File Management Operations ============

/**
 * Create Directory Invoker
 */
export async function invokeCreateDirectory(args: CreateDirectoryArgs): Promise<CreateDirectoryResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(FILE_CREATE_DIR_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Move File Invoker
 */
export async function invokeMoveFile(args: MoveFileArgs): Promise<MoveFileResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(FILE_MOVE_ACTION, withChatUuid(args))
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}
