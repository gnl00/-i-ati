/**
 * Command Invoker - Renderer Process
 * 渲染进程中的命令执行调用器
 */

import { COMMAND_EXECUTE_ACTION } from '@shared/constants/index'
import type {
  ExecuteCommandArgs,
  ExecuteCommandResponse
} from '@tools/command/index.d'

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
 * Execute Command Invoker
 * 执行命令并处理用户确认流程
 */
export async function invokeExecuteCommand(args: ExecuteCommandArgs): Promise<ExecuteCommandResponse> {
  console.log('[ExecuteCommandInvoker] Executing command:', args.command)

  try {
    const ipc = getElectronIPC()
    const response: ExecuteCommandResponse = await ipc.invoke(COMMAND_EXECUTE_ACTION, args)

    console.log('[ExecuteCommandInvoker] Response:', response.success ? 'success' : 'failed')
    return response
  } catch (error: any) {
    console.error('[ExecuteCommandInvoker] Error:', error)
    return {
      success: false,
      command: args.command,
      error: error.message || 'Unknown error occurred'
    }
  }
}
