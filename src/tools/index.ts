/**
 * Embedded Tools Entry Point
 * 统一导出所有 embedded tools 的定义和处理器
 */

import { embeddedToolsRegistry, type ToolDefinition } from './registry'
import toolsDefinitions from './tools.json'
import { invokeWebSearch } from './webSearch/renderer/WebSearchInvoker'
import {
  invokeReadFile,
  invokeWriteFile,
  invokeEditFile,
  invokeSearchFile
} from './fileOperations/renderer/FileOperationsInvoker'
import {
  invokeReadTextFile,
  invokeReadMediaFile,
  invokeReadMultipleFiles,
  invokeListDirectory
} from './fileOperations/renderer/FileOperationsInvokerExtended'
import {
  invokeListDirectoryWithSizes,
  invokeGetFileInfo,
  invokeCreateDirectory,
  invokeMoveFile
} from './fileOperations/renderer/FileOperationsInvokerExtra'

/**
 * 工具处理器映射表
 * 将工具名称映射到对应的处理器函数
 */
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  'web_search': invokeWebSearch,
  'read_file': invokeReadFile,
  'write_file': invokeWriteFile,
  'edit_file': invokeEditFile,
  'search_file': invokeSearchFile,
  // New file operations tools
  'read_text_file': invokeReadTextFile,
  'read_media_file': invokeReadMediaFile,
  'read_multiple_files': invokeReadMultipleFiles,
  'list_directory': invokeListDirectory,
  'list_directory_with_sizes': invokeListDirectoryWithSizes,
  'get_file_info': invokeGetFileInfo,
  'create_directory': invokeCreateDirectory,
  'move_file': invokeMoveFile,
  // 在这里添加更多工具处理器
  // 'another_tool': anotherToolHandler,
}

/**
 * 初始化所有 embedded tools
 * 在应用启动时调用此函数来注册所有工具
 */
export function initializeEmbeddedTools(): void {
  console.log('[EmbeddedTools] Initializing embedded tools...')

  // 遍历 tools.json 中的所有工具定义
  const tools = toolsDefinitions as ToolDefinition[]

  tools.forEach(toolDef => {
    const toolName = toolDef.function.name
    const handler = toolHandlers[toolName]

    if (handler) {
      // 注册工具，同时保存工具定义
      embeddedToolsRegistry.register(toolName, handler, toolDef)
      console.log(`[EmbeddedTools] Registered: ${toolName}`)
    } else {
      console.warn(`[EmbeddedTools] Warning: No handler found for tool "${toolName}"`)
    }
  })

  console.log('[EmbeddedTools] All embedded tools registered:', embeddedToolsRegistry.getRegisteredTools())
}

// 导出注册中心和工具定义
export { embeddedToolsRegistry } from './registry'
export { toolsDefinitions as embeddedToolsDefinitions }

