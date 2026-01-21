import { ipcMain, shell, dialog } from 'electron'
import {
  CHECK_IS_DIRECTORY,
  GET_WIN_POSITION,
  HTTP_REQUEST,
  IPC_PING,
  OPEN_EXTERNAL,
  PIN_WINDOW,
  SELECT_DIRECTORY,
  SET_WIN_POSITION,
  WIN_CLOSE,
  WIN_MAXIMIZE,
  WIN_MINIMIZE
} from '@shared/constants'
import { getWinPosition, pinWindow, setWinPosition, windowsClose, windowsMaximize, windowsMinimize } from '@main/main-window'

export function registerSystemHandlers(): void {
  ipcMain.handle(PIN_WINDOW, (_event, pinState) => pinWindow(pinState))
  ipcMain.handle(GET_WIN_POSITION, (): number[] => getWinPosition())
  ipcMain.handle(SET_WIN_POSITION, (_, options) => setWinPosition(options))
  ipcMain.handle(WIN_MINIMIZE, () => windowsMinimize())
  ipcMain.handle(WIN_MAXIMIZE, () => windowsMaximize())
  ipcMain.handle(WIN_CLOSE, () => windowsClose())
  ipcMain.handle(OPEN_EXTERNAL, (_, url) => {
    // console.log('main received url', url)
    shell.openExternal(url)
  })
  ipcMain.on(IPC_PING, () => console.log('pong'))

  ipcMain.handle(HTTP_REQUEST, async (_, { url, options }) => {
    const response = await fetch(url, options)
    const data = options.stream
      ? { body: response.body, headers: Object.fromEntries(response.headers), ok: response.ok, status: response.status }
      : { data: await response.json(), headers: Object.fromEntries(response.headers), ok: response.ok, status: response.status }
    return data
  })

  ipcMain.handle(SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, path: null }
    }

    const selectedPath = result.filePaths[0]
    console.log(`[Workspace] Directory selected: ${selectedPath}`)
    return { success: true, path: selectedPath }
  })

  ipcMain.handle(CHECK_IS_DIRECTORY, async (_event, path: string) => {
    try {
      const { stat } = await import('fs/promises')
      const stats = await stat(path)
      return { success: true, isDirectory: stats.isDirectory() }
    } catch (error) {
      return { success: false, isDirectory: false, error: (error as Error).message }
    }
  })
}
