import { WORKSPACE_ENSURE_DIRECTORY } from '@shared/constants'

export interface EnsureWorkspaceDirectoryArgs {
  chat_uuid?: string
  workspace_path?: string
}

export interface EnsureWorkspaceDirectoryResponse {
  success: boolean
  path?: string
  created?: boolean
  error?: string
}

function getElectronIPC() {
  const electron = (window as any).electron
  if (!electron?.ipcRenderer) {
    throw new Error('Electron IPC not available')
  }
  return electron.ipcRenderer
}

export async function invokeEnsureWorkspaceDirectory(
  args: EnsureWorkspaceDirectoryArgs
): Promise<EnsureWorkspaceDirectoryResponse> {
  try {
    const ipc = getElectronIPC()
    return await ipc.invoke(WORKSPACE_ENSURE_DIRECTORY, args)
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
}
