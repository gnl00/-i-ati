import {
  FILE_READ_ACTION,
  FILE_WRITE_ACTION,
  FILE_EDIT_ACTION,
  FILE_SEARCH_ACTION
} from '@constants/index'
import type {
  ReadTextFileArgs,
  ReadTextFileResponse,
  WriteFileArgs,
  WriteFileResponse,
  EditFileArgs,
  EditFileResponse,
  SearchFileArgs,
  SearchFileResponse
} from '../index'

/**
 * Read File Tool Handler
 * 从 Renderer 进程调用 Main 进程读取文件
 */
export async function invokeReadFile(args: ReadTextFileArgs): Promise<ReadTextFileResponse> {
  console.log('[ReadFileInvoker] Reading file:', args.file_path)

  try {
    const electron = (window as any).electron
    if (!electron || !electron.ipcRenderer) {
      throw new Error('Electron IPC not available')
    }

    const response: ReadTextFileResponse = await electron.ipcRenderer.invoke(
      FILE_READ_ACTION,
      args
    )

    console.log('[ReadFileInvoker] Read response:', response.success ? 'success' : 'failed')
    return response

  } catch (error: any) {
    console.error('[ReadFileInvoker] Error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
}

/**
 * Write File Tool Handler
 * 从 Renderer 进程调用 Main 进程写入文件
 */
export async function invokeWriteFile(args: WriteFileArgs): Promise<WriteFileResponse> {
  console.log('[WriteFileInvoker] Writing file:', args.file_path)

  try {
    const electron = (window as any).electron
    if (!electron || !electron.ipcRenderer) {
      throw new Error('Electron IPC not available')
    }

    const response: WriteFileResponse = await electron.ipcRenderer.invoke(
      FILE_WRITE_ACTION,
      args
    )

    console.log('[WriteFileInvoker] Write response:', response.success ? 'success' : 'failed')
    return response

  } catch (error: any) {
    console.error('[WriteFileInvoker] Error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
}

/**
 * Edit File Tool Handler
 * 从 Renderer 进程调用 Main 进程编辑文件
 */
export async function invokeEditFile(args: EditFileArgs): Promise<EditFileResponse> {
  console.log('[EditFileInvoker] Editing file:', args.file_path)

  try {
    const electron = (window as any).electron
    if (!electron || !electron.ipcRenderer) {
      throw new Error('Electron IPC not available')
    }

    const response: EditFileResponse = await electron.ipcRenderer.invoke(
      FILE_EDIT_ACTION,
      args
    )

    console.log('[EditFileInvoker] Edit response:', response.success ? 'success' : 'failed')
    return response

  } catch (error: any) {
    console.error('[EditFileInvoker] Error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
}

/**
 * Search File Tool Handler
 * 从 Renderer 进程调用 Main 进程搜索文件
 */
export async function invokeSearchFile(args: SearchFileArgs): Promise<SearchFileResponse> {
  console.log('[SearchFileInvoker] Searching file:', args.file_path)

  try {
    const electron = (window as any).electron
    if (!electron || !electron.ipcRenderer) {
      throw new Error('Electron IPC not available')
    }

    const response: SearchFileResponse = await electron.ipcRenderer.invoke(
      FILE_SEARCH_ACTION,
      args
    )

    console.log('[SearchFileInvoker] Search response:', response.success ? 'success' : 'failed')
    return response

  } catch (error: any) {
    console.error('[SearchFileInvoker] Error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
}
