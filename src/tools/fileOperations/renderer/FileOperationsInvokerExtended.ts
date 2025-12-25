import {
  FILE_READ_TEXT_ACTION,
  FILE_READ_MEDIA_ACTION,
  FILE_READ_MULTIPLE_ACTION,
  FILE_LIST_DIR_ACTION
} from '@constants/index'
import type {
  ReadTextFileArgs,
  ReadTextFileResponse,
  ReadMediaFileArgs,
  ReadMediaFileResponse,
  ReadMultipleFilesArgs,
  ReadMultipleFilesResponse,
  ListDirectoryArgs,
  ListDirectoryResponse
} from '../index'

/**
 * Read Text File Tool Handler
 */
export async function invokeReadTextFile(args: ReadTextFileArgs): Promise<ReadTextFileResponse> {
  console.log('[ReadTextFileInvoker] Reading text file:', args.file_path)

  try {
    const electron = (window as any).electron
    if (!electron || !electron.ipcRenderer) {
      throw new Error('Electron IPC not available')
    }

    const response: ReadTextFileResponse = await electron.ipcRenderer.invoke(
      FILE_READ_TEXT_ACTION,
      args
    )

    console.log('[ReadTextFileInvoker] Response:', response.success ? 'success' : 'failed')
    return response

  } catch (error: any) {
    console.error('[ReadTextFileInvoker] Error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
}

/**
 * Read Media File Tool Handler
 */
export async function invokeReadMediaFile(args: ReadMediaFileArgs): Promise<ReadMediaFileResponse> {
  console.log('[ReadMediaFileInvoker] Reading media file:', args.file_path)

  try {
    const electron = (window as any).electron
    if (!electron || !electron.ipcRenderer) {
      throw new Error('Electron IPC not available')
    }

    const response: ReadMediaFileResponse = await electron.ipcRenderer.invoke(
      FILE_READ_MEDIA_ACTION,
      args
    )

    console.log('[ReadMediaFileInvoker] Response:', response.success ? 'success' : 'failed')
    return response

  } catch (error: any) {
    console.error('[ReadMediaFileInvoker] Error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
}

/**
 * Read Multiple Files Tool Handler
 */
export async function invokeReadMultipleFiles(args: ReadMultipleFilesArgs): Promise<ReadMultipleFilesResponse> {
  try {
    const electron = (window as any).electron
    if (!electron?.ipcRenderer) throw new Error('Electron IPC not available')
    return await electron.ipcRenderer.invoke(FILE_READ_MULTIPLE_ACTION, args)
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * List Directory Tool Handler
 */
export async function invokeListDirectory(args: ListDirectoryArgs): Promise<ListDirectoryResponse> {
  try {
    const electron = (window as any).electron
    if (!electron?.ipcRenderer) throw new Error('Electron IPC not available')
    return await electron.ipcRenderer.invoke(FILE_LIST_DIR_ACTION, args)
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}
