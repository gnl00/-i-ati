import { close as mcpClose, connect as mcpConnect, toolCall as mcpToolCall } from '@mcp/client'
import { processWebSearch, processWebFetch } from '@tools/webTools/main/WebToolsProcessor'
import {
  processReadTextFile,
  processReadMediaFile,
  processReadMultipleFiles,
  processWriteFile,
  processEditFile,
  processSearchFile,
  processSearchFiles,
  processListDirectory,
  processListDirectoryWithSizes,
  processDirectoryTree,
  processGetFileInfo,
  processCreateDirectory,
  processMoveFile
} from '@tools/fileOperations/main/FileOperationsProcessor'
import {
  processCheckPreviewSh,
  processStartDevServer,
  processStopDevServer,
  processGetDevServerStatus,
  processGetDevServerLogs
} from '@tools/devServer/main/DevServerProcessor'
import { ipcMain, shell } from 'electron'
import streamingjson from 'streaming-json'
import {
  OPEN_EXTERNAL,
  PIN_WINDOW,
  WEB_SEARCH_ACTION,
  WEB_FETCH_ACTION,
  WIN_CLOSE,
  WIN_MINIMIZE,
  WIN_MAXIMIZE,
  MCP_CONNECT,
  MCP_DISCONNECT,
  MCP_TOOL_CALL,
  FILE_READ_TEXT_ACTION,
  FILE_READ_MEDIA_ACTION,
  FILE_READ_MULTIPLE_ACTION,
  FILE_WRITE_ACTION,
  FILE_EDIT_ACTION,
  FILE_SEARCH_ACTION,
  FILE_SEARCH_FILES_ACTION,
  FILE_LIST_DIR_ACTION,
  FILE_LIST_DIR_SIZES_ACTION,
  FILE_DIR_TREE_ACTION,
  FILE_GET_INFO_ACTION,
  FILE_CREATE_DIR_ACTION,
  FILE_MOVE_ACTION,
  DEV_SERVER_CHECK_PREVIEW_SH,
  DEV_SERVER_START,
  DEV_SERVER_STOP,
  DEV_SERVER_STATUS,
  DEV_SERVER_LOGS
} from '../constants'
import { getWinPosition, pinWindow, setWinPosition, windowsClose, windowsMaximize, windowsMinimize } from './main-window'

function mainIPCSetup() {
  ipcMain.handle(PIN_WINDOW, (_event, pinState) => pinWindow(pinState))
  ipcMain.handle('get-win-position', (): number[] => getWinPosition())
  ipcMain.handle('set-position', (_, options) => setWinPosition(options))
  ipcMain.handle(WIN_MINIMIZE, () => windowsMinimize())
  ipcMain.handle(WIN_MAXIMIZE, () => windowsMaximize())
  ipcMain.handle(WIN_CLOSE, () => windowsClose())
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

  ipcMain.handle(WEB_FETCH_ACTION, (_event, { url }) => {
    console.log(`[WebFetch IPC] Fetching URL: ${url}`)
    return processWebFetch({ url })
  })

  // File Operations handlers
  ipcMain.handle(FILE_READ_TEXT_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Read text file: ${args.file_path}`)
    return processReadTextFile(args)
  })

  ipcMain.handle(FILE_READ_MEDIA_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Read media file: ${args.file_path}`)
    return processReadMediaFile(args)
  })

  ipcMain.handle(FILE_READ_MULTIPLE_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Read multiple files: ${args.file_paths.length} files`)
    return processReadMultipleFiles(args)
  })

  ipcMain.handle(FILE_WRITE_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Write file: ${args.file_path}`)
    return processWriteFile(args)
  })

  ipcMain.handle(FILE_EDIT_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Edit file: ${args.file_path}`)
    return processEditFile(args)
  })

  ipcMain.handle(FILE_SEARCH_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Search file: ${args.file_path}`)
    return processSearchFile(args)
  })

  ipcMain.handle(FILE_SEARCH_FILES_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Search files in: ${args.directory_path}`)
    return processSearchFiles(args)
  })

  ipcMain.handle(FILE_LIST_DIR_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] List directory: ${args.directory_path}`)
    return processListDirectory(args)
  })

  ipcMain.handle(FILE_LIST_DIR_SIZES_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] List directory with sizes: ${args.directory_path}`)
    return processListDirectoryWithSizes(args)
  })

  ipcMain.handle(FILE_DIR_TREE_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Build directory tree: ${args.directory_path}`)
    return processDirectoryTree(args)
  })

  ipcMain.handle(FILE_GET_INFO_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Get file info: ${args.file_path}`)
    return processGetFileInfo(args)
  })

  ipcMain.handle(FILE_CREATE_DIR_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Create directory: ${args.directory_path}`)
    return processCreateDirectory(args)
  })

  ipcMain.handle(FILE_MOVE_ACTION, (_event, args) => {
    console.log(`[FileOps IPC] Move file: ${args.source_path} -> ${args.destination_path}`)
    return processMoveFile(args)
  })

  // DevServer Operations handlers
  ipcMain.handle(DEV_SERVER_CHECK_PREVIEW_SH, (_event, args) => {
    console.log(`[DevServer IPC] Check preview.sh: ${args.chatUuid}`)
    return processCheckPreviewSh(args)
  })

  ipcMain.handle(DEV_SERVER_START, (_event, args) => {
    console.log(`[DevServer IPC] Start dev server: ${args.chatUuid}`)
    return processStartDevServer(args)
  })

  ipcMain.handle(DEV_SERVER_STOP, (_event, args) => {
    console.log(`[DevServer IPC] Stop dev server: ${args.chatUuid}`)
    return processStopDevServer(args)
  })

  ipcMain.handle(DEV_SERVER_STATUS, (_event, args) => {
    console.log(`[DevServer IPC] Get dev server status: ${args.chatUuid}`)
    return processGetDevServerStatus(args)
  })

  ipcMain.handle(DEV_SERVER_LOGS, (_event, args) => {
    console.log(`[DevServer IPC] Get dev server logs: ${args.chatUuid}`)
    return processGetDevServerLogs(args)
  })

  ipcMain.handle(MCP_CONNECT, async (_, mcpProps) => {
    try {
      return await mcpConnect(mcpProps)
    } catch (error: any) {
      console.error('[@i] mcp-connect handler error:', error)
      return { result: false, msg: `Connection error: ${error.message || 'Unknown error'}` }
    }
  })
  ipcMain.handle(MCP_DISCONNECT, (_, { name }) => mcpClose(name))
  ipcMain.handle(MCP_TOOL_CALL, (_, { callId, tool, args }) => {
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
