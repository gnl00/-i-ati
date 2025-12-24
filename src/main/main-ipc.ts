import { close as mcpClose, connect as mcpConnect, toolCall as mcpToolCall } from '@mcp/client'
import { processWebSearch } from '@tools/webSearch/main/WebSearchProcessor'
import { ipcMain, shell } from 'electron'
import streamingjson from 'streaming-json'
import { OPEN_EXTERNAL, PIN_WINDOW, WEB_SEARCH_ACTION } from '../constants'
import { getWinPosition, pinWindow, setWinPosition, windowsClose, windowsMaximize, windowsMinimize } from './main-window'

function mainIPCSetup() {
  ipcMain.handle(PIN_WINDOW, (_event, pinState) => pinWindow(pinState))
  ipcMain.handle('get-win-position', (): number[] => getWinPosition())
  ipcMain.handle('set-position', (_, options) => setWinPosition(options))
  ipcMain.handle('win-minimize', () => windowsMinimize())
  ipcMain.handle('win-maximize', () => windowsMaximize())
  ipcMain.handle('win-close', () => windowsClose())
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

  ipcMain.handle(WEB_SEARCH_ACTION, (_event, { param, fetchCounts }) => {
    const counts = fetchCounts ?? 3
    console.log(`[WebSearch IPC] Using fetchCounts: ${counts}`)
    return processWebSearch({ fetchCounts: counts, param })
  })

  ipcMain.handle('mcp-connect', async (_, mcpProps) => {
    try {
      return await mcpConnect(mcpProps)
    } catch (error: any) {
      console.error('[@i] mcp-connect handler error:', error)
      return { result: false, msg: `Connection error: ${error.message || 'Unknown error'}` }
    }
  })
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
