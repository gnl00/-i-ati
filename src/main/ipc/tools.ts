import { ipcMain } from 'electron'
import { close as mcpClose, connect as mcpConnect, toolCall as mcpToolCall } from '@main/mcp/client'
import { processWebSearch, processWebFetch } from '@main/tools/webTools/WebToolsProcessor'
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
} from '@main/tools/fileOperations/FileOperationsProcessor'
import {
  processCheckPreviewSh,
  processStartDevServer,
  processStopDevServer,
  processGetDevServerStatus,
  processGetDevServerLogs
} from '@main/tools/devServer/DevServerProcessor'
import { processMemoryRetrieval, processMemorySave } from '@main/tools/memory/MemoryToolsProcessor'
import { processExecuteCommand } from '@main/tools/command/CommandProcessor'
import EmbeddingServiceInstance from '@main/services/embedding/EmbeddingService'
import MemoryService from '@main/services/memory/MemoryService'
import {
  WEB_SEARCH_ACTION,
  WEB_FETCH_ACTION,
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
  DEV_SERVER_LOGS,
  MEMORY_ADD,
  MEMORY_ADD_BATCH,
  MEMORY_SEARCH,
  MEMORY_GET_CHAT,
  MEMORY_GET_ALL,
  MEMORY_DELETE,
  MEMORY_DELETE_CHAT,
  MEMORY_GET_STATS,
  MEMORY_CLEAR,
  MEMORY_RETRIEVAL_ACTION,
  MEMORY_SAVE_ACTION,
  COMMAND_EXECUTE_ACTION,
  MCP_CONNECT,
  MCP_DISCONNECT,
  MCP_TOOL_CALL,
  EMBEDDING_GENERATE,
  EMBEDDING_GENERATE_BATCH,
  EMBEDDING_GET_MODEL_INFO
} from '@shared/constants'

export function registerToolHandlers(): void {
  ipcMain.handle(WEB_SEARCH_ACTION, (_event, { param, fetchCounts, snippetsOnly }) => {
    const counts = fetchCounts ?? 3
    console.log(`[WebSearch IPC] Using fetchCounts: ${counts}`)
    return processWebSearch({ fetchCounts: counts, param, snippetsOnly })
  })

  ipcMain.handle(WEB_FETCH_ACTION, (_event, args) => {
    console.log(`[WebFetch IPC] Fetching URL: ${args?.url}`)
    return processWebFetch(args)
  })

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
    console.log(`[FileOps IPC] Search files: ${args.directory_path}`)
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
    console.log(`[FileOps IPC] Directory tree: ${args.directory_path}`)
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

  ipcMain.handle(DEV_SERVER_CHECK_PREVIEW_SH, (_event, args) => {
    console.log(`[DevServer IPC] Check preview.sh: ${args.workspace_path}`)
    return processCheckPreviewSh(args)
  })
  ipcMain.handle(DEV_SERVER_START, (_event, args) => {
    console.log(`[DevServer IPC] Start dev server: ${args.workspace_path}`)
    return processStartDevServer(args)
  })
  ipcMain.handle(DEV_SERVER_STOP, (_event, args) => {
    console.log(`[DevServer IPC] Stop dev server: ${args.workspace_path}`)
    return processStopDevServer(args)
  })
  ipcMain.handle(DEV_SERVER_STATUS, (_event, args) => {
    console.log(`[DevServer IPC] Get dev server status: ${args.workspace_path}`)
    return processGetDevServerStatus(args)
  })
  ipcMain.handle(DEV_SERVER_LOGS, (_event, args) => {
    console.log(`[DevServer IPC] Get dev server logs: ${args.workspace_path}`)
    return processGetDevServerLogs(args)
  })

  ipcMain.handle(MEMORY_RETRIEVAL_ACTION, async (_event, args) => {
    console.log('[Memory IPC] Retrieval')
    return await processMemoryRetrieval(args)
  })
  ipcMain.handle(MEMORY_SAVE_ACTION, async (_event, args) => {
    console.log('[Memory IPC] Save')
    return await processMemorySave(args)
  })

  ipcMain.handle(COMMAND_EXECUTE_ACTION, async (_event, args) => {
    console.log('[Command IPC] Execute')
    return await processExecuteCommand(args)
  })

  ipcMain.handle(MCP_CONNECT, async (_, mcpProps) => {
    console.log('[MCP IPC] Connect')
    return mcpConnect(mcpProps)
  })
  ipcMain.handle(MCP_DISCONNECT, (_, { name }) => mcpClose(name))
  ipcMain.handle(MCP_TOOL_CALL, (_, { callId, tool, args }) => {
    return mcpToolCall(callId, tool, args)
  })

  ipcMain.handle(MEMORY_ADD, async (_event, args) => {
    console.log('[Memory IPC] Add')
    return await MemoryService.addMemory(args)
  })
  ipcMain.handle(MEMORY_ADD_BATCH, async (_event, args) => {
    console.log('[Memory IPC] Add batch')
    return await MemoryService.addBatchMemories(args)
  })
  ipcMain.handle(MEMORY_SEARCH, async (_event, args) => {
    console.log('[Memory IPC] Search')
    return await MemoryService.searchMemories(args.query ?? args, args.options ?? {})
  })
  ipcMain.handle(MEMORY_GET_CHAT, async (_event, args) => {
    console.log('[Memory IPC] Get chat')
    return await MemoryService.getChatMemories(args.chatId ?? args)
  })
  ipcMain.handle(MEMORY_GET_ALL, async () => {
    console.log('[Memory IPC] Get all')
    return await MemoryService.getAllMemories()
  })
  ipcMain.handle(MEMORY_DELETE, async (_event, args) => {
    console.log('[Memory IPC] Delete')
    return await MemoryService.deleteMemory(args)
  })
  ipcMain.handle(MEMORY_DELETE_CHAT, async (_event, args) => {
    console.log('[Memory IPC] Delete chat')
    return await MemoryService.deleteChatMemories(args.chatId ?? args)
  })
  ipcMain.handle(MEMORY_GET_STATS, async (_event) => {
    console.log('[Memory IPC] Get stats')
    return await MemoryService.getStats()
  })
  ipcMain.handle(MEMORY_CLEAR, async (_event) => {
    console.log('[Memory IPC] Clear')
    return await MemoryService.clear()
  })

  ipcMain.handle(EMBEDDING_GENERATE, async (_event, args) => {
    console.log('[Embedding IPC] Generate')
    return await EmbeddingServiceInstance.generateEmbedding(args)
  })
  ipcMain.handle(EMBEDDING_GENERATE_BATCH, async (_event, args) => {
    console.log('[Embedding IPC] Generate batch')
    return await EmbeddingServiceInstance.generateBatchEmbeddings(args.texts ?? args, args.options)
  })
  ipcMain.handle(EMBEDDING_GET_MODEL_INFO, async (_event) => {
    console.log('[Embedding IPC] Get model info')
    return await EmbeddingServiceInstance.getModelInfo()
  })
}
