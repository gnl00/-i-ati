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
  processMoveFile,
  setWorkspaceBaseDir
} from '@tools/fileOperations/main/FileOperationsProcessor'
import {
  processCheckPreviewSh,
  processStartDevServer,
  processStopDevServer,
  processGetDevServerStatus,
  processGetDevServerLogs
} from '@tools/devServer/main/DevServerProcessor'
import {
  processMemoryRetrieval,
  processMemorySave
} from '@tools/memory/main/MemoryToolsProcessor'
import { ipcMain, shell } from 'electron'
import streamingjson from 'streaming-json'
import EmbeddingServiceInstance from './services/embedding/EmbeddingService'
import MemoryService from './services/memory/MemoryService'
import DatabaseService from './services/DatabaseService'
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
  FILE_SET_WORKSPACE_BASE_DIR,
  DEV_SERVER_CHECK_PREVIEW_SH,
  DEV_SERVER_START,
  DEV_SERVER_STOP,
  DEV_SERVER_STATUS,
  DEV_SERVER_LOGS,
  MEMORY_ADD,
  MEMORY_ADD_BATCH,
  MEMORY_SEARCH,
  MEMORY_GET_CHAT,
  MEMORY_DELETE,
  MEMORY_DELETE_CHAT,
  MEMORY_GET_STATS,
  MEMORY_CLEAR,
  EMBEDDING_GENERATE,
  EMBEDDING_GENERATE_BATCH,
  EMBEDDING_GET_MODEL_INFO,
  MEMORY_RETRIEVAL_ACTION,
  MEMORY_SAVE_ACTION,
  DB_CHAT_SAVE,
  DB_CHAT_GET_ALL,
  DB_CHAT_GET_BY_ID,
  DB_CHAT_UPDATE,
  DB_CHAT_DELETE,
  DB_MESSAGE_SAVE,
  DB_MESSAGE_GET_ALL,
  DB_MESSAGE_GET_BY_ID,
  DB_MESSAGE_GET_BY_IDS,
  DB_MESSAGE_UPDATE,
  DB_MESSAGE_DELETE,
  DB_CONFIG_GET,
  DB_CONFIG_SAVE,
  DB_CONFIG_INIT
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

  ipcMain.handle(FILE_SET_WORKSPACE_BASE_DIR, (_event, chatUuid: string) => {
    console.log(`[FileOps IPC] Set workspace base dir: ${chatUuid}`)
    setWorkspaceBaseDir(chatUuid)
    return { success: true }
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

  // Memory Tools handlers
  ipcMain.handle(MEMORY_RETRIEVAL_ACTION, async (_event, args) => {
    console.log(`[MemoryTools IPC] Retrieve memories: ${args.query}`)
    return await processMemoryRetrieval(args)
  })

  ipcMain.handle(MEMORY_SAVE_ACTION, async (_event, args) => {
    console.log(`[MemoryTools IPC] Save memory for chat: ${args.chatId}`)
    return await processMemorySave(args)
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

  // Memory & Embedding handlers
  ipcMain.handle(MEMORY_ADD, async (_event, args) => {
    console.log(`[Memory IPC] Add memory for chat: ${args.chatId}`)
    return await MemoryService.addMemory(args)
  })

  ipcMain.handle(MEMORY_ADD_BATCH, async (_event, args) => {
    console.log(`[Memory IPC] Add batch memories: ${args.entries.length} entries`)
    return await MemoryService.addBatchMemories(args.entries)
  })

  ipcMain.handle(MEMORY_SEARCH, async (_event, args) => {
    console.log(`[Memory IPC] Search memories: ${args.query}`)
    return await MemoryService.searchMemories(args.query, args.options)
  })

  ipcMain.handle(MEMORY_GET_CHAT, async (_event, args) => {
    console.log(`[Memory IPC] Get chat memories: ${args.chatId}`)
    return await MemoryService.getChatMemories(args.chatId)
  })

  ipcMain.handle(MEMORY_DELETE, async (_event, args) => {
    console.log(`[Memory IPC] Delete memory: ${args.id}`)
    return await MemoryService.deleteMemory(args.id)
  })

  ipcMain.handle(MEMORY_DELETE_CHAT, async (_event, args) => {
    console.log(`[Memory IPC] Delete chat memories: ${args.chatId}`)
    return await MemoryService.deleteChatMemories(args.chatId)
  })

  ipcMain.handle(MEMORY_GET_STATS, async (_event) => {
    console.log(`[Memory IPC] Get stats`)
    return MemoryService.getStats()
  })

  ipcMain.handle(MEMORY_CLEAR, async (_event) => {
    console.log(`[Memory IPC] Clear all memories`)
    return await MemoryService.clear()
  })

  ipcMain.handle(EMBEDDING_GENERATE, async (_event, args) => {
    console.log(`[Embedding IPC] Generate embedding`)
    return await EmbeddingServiceInstance.generateEmbedding(args.text, args.options)
  })

  ipcMain.handle(EMBEDDING_GENERATE_BATCH, async (_event, args) => {
    console.log(`[Embedding IPC] Generate batch embeddings: ${args.texts.length} texts`)
    return await EmbeddingServiceInstance.generateBatchEmbeddings(args.texts, args.options)
  })

  ipcMain.handle(EMBEDDING_GET_MODEL_INFO, async (_event) => {
    console.log(`[Embedding IPC] Get model info`)
    return EmbeddingServiceInstance.getModelInfo()
  })

  // ==================== Database Operations - Chat ====================

  ipcMain.handle(DB_CHAT_SAVE, async (_event, data) => {
    console.log(`[Database IPC] Save chat`)
    return DatabaseService.saveChat(data)
  })

  ipcMain.handle(DB_CHAT_GET_ALL, async (_event) => {
    console.log(`[Database IPC] Get all chats`)
    return DatabaseService.getAllChats()
  })

  ipcMain.handle(DB_CHAT_GET_BY_ID, async (_event, id) => {
    console.log(`[Database IPC] Get chat by id: ${id}`)
    return DatabaseService.getChatById(id)
  })

  ipcMain.handle(DB_CHAT_UPDATE, async (_event, data) => {
    console.log(`[Database IPC] Update chat: ${data.id}`)
    return DatabaseService.updateChat(data)
  })

  ipcMain.handle(DB_CHAT_DELETE, async (_event, id) => {
    console.log(`[Database IPC] Delete chat: ${id}`)
    return DatabaseService.deleteChat(id)
  })

  // ==================== Database Operations - Message ====================

  ipcMain.handle(DB_MESSAGE_SAVE, async (_event, data) => {
    console.log(`[Database IPC] Save message`)
    return DatabaseService.saveMessage(data)
  })

  ipcMain.handle(DB_MESSAGE_GET_ALL, async (_event) => {
    console.log(`[Database IPC] Get all messages`)
    return DatabaseService.getAllMessages()
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_ID, async (_event, id) => {
    console.log(`[Database IPC] Get message by id: ${id}`)
    return DatabaseService.getMessageById(id)
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_IDS, async (_event, ids) => {
    console.log(`[Database IPC] Get messages by ids: ${ids.length} ids`)
    return DatabaseService.getMessageByIds(ids)
  })

  ipcMain.handle(DB_MESSAGE_UPDATE, async (_event, data) => {
    console.log(`[Database IPC] Update message: ${data.id}`)
    return DatabaseService.updateMessage(data)
  })

  ipcMain.handle(DB_MESSAGE_DELETE, async (_event, id) => {
    console.log(`[Database IPC] Delete message: ${id}`)
    return DatabaseService.deleteMessage(id)
  })

  // ==================== Database Operations - Config ====================

  ipcMain.handle(DB_CONFIG_GET, async (_event) => {
    console.log(`[Database IPC] Get config`)
    return DatabaseService.getConfig()
  })

  ipcMain.handle(DB_CONFIG_SAVE, async (_event, config) => {
    console.log(`[Database IPC] Save config`)
    return DatabaseService.saveConfig(config)
  })

  ipcMain.handle(DB_CONFIG_INIT, async (_event) => {
    console.log(`[Database IPC] Init config`)
    return DatabaseService.initConfig()
  })

}

export {
  mainIPCSetup
}
