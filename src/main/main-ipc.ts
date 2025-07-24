import { shell, ipcMain } from 'electron'
import { PIN_WINDOW, SAVE_CONFIG, GET_CONFIG, OPEN_EXTERNAL, WEB_SEARCH_ACTION } from '../constants'
import { appConfig, saveConfig } from './app-config'
import { pinWindow, getWinPosition, setWinPosition } from './main-window'
import { handleWebSearch } from './web-search'

function mainIPCSetup() {
  ipcMain.handle(PIN_WINDOW, (_, pinState) => pinWindow(pinState))
  ipcMain.handle(SAVE_CONFIG, (_, config) => saveConfig(config))
  ipcMain.handle('get-win-position', (): number[] => getWinPosition())
  ipcMain.handle('set-position', (_, options) => setWinPosition(options))
  ipcMain.handle(GET_CONFIG, (): IAppConfig => appConfig)
  ipcMain.handle(OPEN_EXTERNAL, (_, url) => {
    console.log('main received url', url);
    shell.openExternal(url)
  })
  ipcMain.on('ping', () => console.log('pong'))

  // Playwright handler for web search
  ipcMain.handle(WEB_SEARCH_ACTION, (event, { action, param }) => handleWebSearch({action, param}))
}

export {
  mainIPCSetup
}