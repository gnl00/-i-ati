import {
  FILE_LIST_DIR_ACTION,
  FILE_LIST_DIR_SIZES_ACTION,
  FILE_GET_INFO_ACTION,
  FILE_CREATE_DIR_ACTION,
  FILE_MOVE_ACTION
} from '@constants/index'
import type {
  ListDirectoryArgs,
  ListDirectoryResponse,
  ListDirectoryWithSizesArgs,
  ListDirectoryWithSizesResponse,
  GetFileInfoArgs,
  GetFileInfoResponse,
  CreateDirectoryArgs,
  CreateDirectoryResponse,
  MoveFileArgs,
  MoveFileResponse
} from '../index'

export async function invokeListDirectory(args: ListDirectoryArgs): Promise<ListDirectoryResponse> {
  try {
    const electron = (window as any).electron
    if (!electron?.ipcRenderer) throw new Error('Electron IPC not available')
    return await electron.ipcRenderer.invoke(FILE_LIST_DIR_ACTION, args)
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

export async function invokeListDirectoryWithSizes(args: ListDirectoryWithSizesArgs): Promise<ListDirectoryWithSizesResponse> {
  try {
    const electron = (window as any).electron
    if (!electron?.ipcRenderer) throw new Error('Electron IPC not available')
    return await electron.ipcRenderer.invoke(FILE_LIST_DIR_SIZES_ACTION, args)
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

export async function invokeGetFileInfo(args: GetFileInfoArgs): Promise<GetFileInfoResponse> {
  try {
    const electron = (window as any).electron
    if (!electron?.ipcRenderer) throw new Error('Electron IPC not available')
    return await electron.ipcRenderer.invoke(FILE_GET_INFO_ACTION, args)
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

export async function invokeCreateDirectory(args: CreateDirectoryArgs): Promise<CreateDirectoryResponse> {
  try {
    const electron = (window as any).electron
    if (!electron?.ipcRenderer) throw new Error('Electron IPC not available')
    return await electron.ipcRenderer.invoke(FILE_CREATE_DIR_ACTION, args)
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

export async function invokeMoveFile(args: MoveFileArgs): Promise<MoveFileResponse> {
  try {
    const electron = (window as any).electron
    if (!electron?.ipcRenderer) throw new Error('Electron IPC not available')
    return await electron.ipcRenderer.invoke(FILE_MOVE_ACTION, args)
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}
