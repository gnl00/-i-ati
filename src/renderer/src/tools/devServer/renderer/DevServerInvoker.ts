/**
 * DevServer Invoker - Renderer Implementation
 * Provides IPC invoke functions for development server operations
 */

import {
  DEV_SERVER_CHECK_PREVIEW_SH,
  DEV_SERVER_START,
  DEV_SERVER_STOP,
  DEV_SERVER_STATUS,
  DEV_SERVER_LOGS
} from '@constants/index'
import type {
  CheckPreviewShArgs,
  CheckPreviewShResponse,
  StartDevServerArgs,
  StartDevServerResponse,
  StopDevServerArgs,
  StopDevServerResponse,
  GetDevServerStatusArgs,
  GetDevServerStatusResponse,
  GetDevServerLogsArgs,
  GetDevServerLogsResponse
} from '@tools/devServer/index.d'

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

/**
 * Check if preview.sh exists in workspace
 */
export async function invokeCheckPreviewSh(
  args: CheckPreviewShArgs
): Promise<CheckPreviewShResponse> {
  const ipc = getElectronIPC()
  return ipc.invoke(DEV_SERVER_CHECK_PREVIEW_SH, args)
}

/**
 * Start development server for workspace
 */
export async function invokeStartDevServer(
  args: StartDevServerArgs
): Promise<StartDevServerResponse> {
  const ipc = getElectronIPC()
  return ipc.invoke(DEV_SERVER_START, args)
}

/**
 * Stop development server for workspace
 */
export async function invokeStopDevServer(
  args: StopDevServerArgs
): Promise<StopDevServerResponse> {
  const ipc = getElectronIPC()
  return ipc.invoke(DEV_SERVER_STOP, args)
}

/**
 * Get development server status
 */
export async function invokeGetDevServerStatus(
  args: GetDevServerStatusArgs
): Promise<GetDevServerStatusResponse> {
  const ipc = getElectronIPC()
  return ipc.invoke(DEV_SERVER_STATUS, args)
}

/**
 * Get development server logs
 */
export async function invokeGetDevServerLogs(
  args: GetDevServerLogsArgs
): Promise<GetDevServerLogsResponse> {
  const ipc = getElectronIPC()
  return ipc.invoke(DEV_SERVER_LOGS, args)
}
