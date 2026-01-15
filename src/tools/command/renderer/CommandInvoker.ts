/**
 * Command Invoker - Renderer Process
 * 渲染进程中的命令执行调用器
 */

import { COMMAND_EXECUTE_ACTION } from '@constants/index'
import { useCommandConfirmationStore } from '@renderer/store/commandConfirmation'
import type {
  ExecuteCommandArgs,
  ExecuteCommandResponse
} from '../index.d'

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

    // 如果需要用户确认
    if (response.requires_confirmation) {
      console.log('[ExecuteCommandInvoker] Command requires user confirmation')
      console.log('[ExecuteCommandInvoker] Risk level:', response.risk_level)
      console.log('[ExecuteCommandInvoker] Risk reason:', response.risk_reason)

      // 显示确认对话框
      const confirmed = await showCommandConfirmationDialog({
        command: args.command,
        risk_level: response.risk_level!,
        risk_reason: response.risk_reason!
      })

      if (confirmed) {
        console.log('[ExecuteCommandInvoker] User confirmed, re-executing with confirmation')
        // 用户确认后重新执行
        return await ipc.invoke(COMMAND_EXECUTE_ACTION, { ...args, confirmed: true })
      } else {
        console.log('[ExecuteCommandInvoker] User cancelled execution')
        return {
          success: false,
          command: args.command,
          error: 'Command execution cancelled by user'
        }
      }
    }

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

/**
 * 显示命令确认对话框
 * 使用 Zustand store 和 UI 组件替代原生 window.confirm
 */
async function showCommandConfirmationDialog(params: {
  command: string
  risk_level: string
  risk_reason: string
}): Promise<boolean> {
  const { command, risk_level, risk_reason } = params

  // 使用 store 请求用户确认
  const confirmed = await useCommandConfirmationStore.getState().requestConfirmation({
    command,
    risk_level: risk_level as 'risky' | 'dangerous',
    risk_reason
  })

  return confirmed
}
