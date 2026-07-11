export interface RendererIpcClient {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (event: unknown, data: unknown) => void): void
  removeListener(channel: string, listener: (event: unknown, data: unknown) => void): void
}

export function getRendererIpc(): RendererIpcClient {
  const electron = (window as Window & { electron?: { ipcRenderer?: RendererIpcClient } }).electron
  if (!electron?.ipcRenderer) {
    throw new Error('Electron IPC not available')
  }
  return electron.ipcRenderer
}

export async function invokeIpc<TResult>(channel: string, ...args: unknown[]): Promise<TResult> {
  return await getRendererIpc().invoke(channel, ...args) as TResult
}
