import { close as mcpClose, connect as mcpConnect, toolCall as mcpToolCall } from '@mcp/client'
import { processWebSearch } from '@tools/webSearch/webSearchProcessor'
import { ipcMain, shell } from 'electron'
import streamingjson from 'streaming-json'
import { GET_CONFIG, OPEN_EXTERNAL, PIN_WINDOW, SAVE_CONFIG, WEB_SEARCH_ACTION } from '../constants'
import { appConfig, saveConfig } from './app-config'
import { getWinPosition, pinWindow, setWinPosition, windowsClose, windowsMaximize, windowsMinimize } from './main-window'

function mainIPCSetup() {
  ipcMain.handle(PIN_WINDOW, (_event, pinState) => pinWindow(pinState))
  ipcMain.handle(SAVE_CONFIG, (_, config) => saveConfig(config))
  ipcMain.handle('get-win-position', (): number[] => getWinPosition())
  ipcMain.handle('set-position', (_, options) => setWinPosition(options))
  ipcMain.handle('win-minimize', () => windowsMinimize())
  ipcMain.handle('win-maximize', () => windowsMaximize())
  ipcMain.handle('win-close', () => windowsClose())
  ipcMain.handle(GET_CONFIG, (): IAppConfig => appConfig)
  ipcMain.handle(OPEN_EXTERNAL, (_, url) => {
    console.log('main received url', url);
    shell.openExternal(url)
  })
  ipcMain.on('ping', () => console.log('pong'))

  // HTTP request handler
  ipcMain.handle('http-request', async (_, { url, options }) => {
    try {
      const response = await fetch(url, options)
      const data = options.stream
        ? { body: response.body, headers: Object.fromEntries(response.headers), ok: response.ok, status: response.status }
        : { data: await response.json(), headers: Object.fromEntries(response.headers), ok: response.ok, status: response.status }
      return data
    } catch (error) {
      throw error
    }
  })

  ipcMain.handle(WEB_SEARCH_ACTION, (_event, { fetchCounts, param }) => processWebSearch({ fetchCounts, param }))

  ipcMain.handle('mcp-connect', (_, mcpProps) => mcpConnect(mcpProps))
  ipcMain.handle('mcp-disconnect', (_, { name }) => mcpClose(name))
  ipcMain.handle('mcp-tool-call', (_, { callId, tool, args }) => {
    // init, @NOTE: We need to assign a new lexer for each JSON stream.
    const lexer = new streamingjson.Lexer()
    // append your JSON segment
    lexer.AppendString(args)
    // console.log('CompleteJSON', lexer.CompleteJSON())
    // console.log('JSON.parse CompleteJSON', JSON.parse(lexer.CompleteJSON()))
    return mcpToolCall(callId, tool, JSON.parse(lexer.CompleteJSON()))
  })

}

export {
  mainIPCSetup
}
