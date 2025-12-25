/**
 * IPC Invoker
 * 统一管理所有 Renderer 进程到 Main 进程的 IPC 调用
 */

import {
  PIN_WINDOW,
  WEB_SEARCH_ACTION,
  WIN_CLOSE,
  WIN_MINIMIZE,
  WIN_MAXIMIZE,
  MCP_CONNECT,
  MCP_DISCONNECT,
  MCP_TOOL_CALL
} from '@constants/index'

/**
 * 获取 Electron IPC Renderer
 */
function getElectronIPC() {
  const electron = (window as any).electron
  if (!electron?.ipcRenderer) {
    throw new Error('Electron IPC not available')
  }
  return electron.ipcRenderer
}

// ============ Window Operations ============

/**
 * 固定/取消固定窗口
 */
export async function invokePinWindow(pinState: boolean): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(PIN_WINDOW, pinState)
}

/**
 * 关闭窗口
 */
export async function invokeWindowClose(): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(WIN_CLOSE)
}

/**
 * 最小化窗口
 */
export async function invokeWindowMinimize(): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(WIN_MINIMIZE)
}

/**
 * 最大化窗口
 */
export async function invokeWindowMaximize(): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(WIN_MAXIMIZE)
}

// ============ MCP Operations ============

/**
 * 连接 MCP 服务器
 */
export async function invokeMcpConnect(mcpProps: any): Promise<any> {
  const ipc = getElectronIPC()
  return await ipc.invoke(MCP_CONNECT, mcpProps)
}

/**
 * 断开 MCP 服务器连接
 */
export async function invokeMcpDisconnect(serverInfo: { name: string }): Promise<any> {
  const ipc = getElectronIPC()
  return await ipc.invoke(MCP_DISCONNECT, serverInfo)
}

/**
 * 调用 MCP 工具
 */
export async function invokeMcpToolCall(toolCallInfo: any): Promise<any> {
  const ipc = getElectronIPC()
  return await ipc.invoke(MCP_TOOL_CALL, toolCallInfo)
}

// ============ Web Search Operations ============

/**
 * 执行 Web 搜索
 */
export async function invokeWebSearchIPC(args: { param: string; fetchCounts?: number }): Promise<any> {
  const ipc = getElectronIPC()
  return await ipc.invoke(WEB_SEARCH_ACTION, args)
}
